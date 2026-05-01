/**
 * CallManager — encapsulates WebRTC PeerConnection, media stream handling,
 * and call signaling over WebSocket.
 */
import { getWSClient } from '@/ws';
import type { CallType, SdpBody, IceCandidateBody } from '@/types';

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const CALL_TIMEOUT_MS = 30_000;

export type CallEventType =
  | 'stream'
  | 'connected'
  | 'ended'
  | 'rejected'
  | 'timeout'
  | 'error'
  | 'mute-change'
  | 'video-change';

export type CallEventHandler = (data: unknown) => void;

export class CallManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private callId: string | null = null;
  private callType: CallType = 'audio';
  private handlers = new Map<CallEventType, Set<CallEventHandler>>();
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubs: (() => void)[] = [];
  private connected = false;

  /** Create a call (caller side) */
  async startCall(callId: string, calleeUid: string, calleeName: string, type: CallType): Promise<void> {
    this.callId = callId;
    this.callType = type;

    const stream = await this.getUserMedia(type);
    this.localStream = stream;
    this.emit('stream', stream);

    await this.createPeerConnection();
    this.addLocalTracks();

    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);

    this.sendSignal('offer_sdp', { callId, sdp: JSON.stringify(offer) });

    // Start signaling listener
    this.listenForSignaling();

    // Start timeout timer
    this.timeoutTimer = setTimeout(() => {
      if (!this.connected) {
        this.emit('timeout', { callId });
        this.cleanup();
      }
    }, CALL_TIMEOUT_MS);
  }

  /** Handle incoming call (callee side) — prepare to accept */
  async prepareIncoming(callId: string, type: CallType): Promise<void> {
    this.callId = callId;
    this.callType = type;

    const stream = await this.getUserMedia(type);
    this.localStream = stream;
    this.emit('stream', stream);

    await this.createPeerConnection();
    this.addLocalTracks();

    this.listenForSignaling();
  }

  /** Accept incoming call (callee side) */
  async acceptCall(): Promise<void> {
    if (!this.pc) return;

    // The offer is already set via prepareIncoming -> listenForSignaling -> offer_sdp
    // Just create and send the answer
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.sendSignal('answer_sdp', {
      callId: this.callId!,
      sdp: JSON.stringify(answer),
    });
  }

  /** Reject a call */
  rejectCall(): void {
    this.sendSignal('call_reject', { callId: this.callId!, reason: 'rejected' });
    this.cleanup();
  }

  /** End a call */
  endCall(): void {
    this.sendSignal('call_end', { callId: this.callId! });
    this.cleanup();
  }

  /** Cancel an outgoing call */
  cancelCall(): void {
    this.sendSignal('call_cancel', { callId: this.callId! });
    this.cleanup();
  }

  /** Toggle microphone mute */
  toggleMute(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.emit('mute-change', !audioTrack.enabled);
        return !audioTrack.enabled;
      }
    }
    return false;
  }

  /** Toggle speaker (only toggles mute on remote audio) */
  toggleSpeaker(): boolean {
    const videoEl = document.getElementById('remote-call-video') as HTMLVideoElement;
    if (videoEl) {
      videoEl.muted = !videoEl.muted;
      return videoEl.muted;
    }
    return false;
  }

  /** Toggle video on/off */
  toggleVideo(): boolean {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        this.emit('video-change', !videoTrack.enabled);
        return !videoTrack.enabled;
      }
    }
    return false;
  }

  /** Set local stream to a <video> element */
  attachLocalStream(element: HTMLVideoElement | null): void {
    if (element && this.localStream) {
      element.srcObject = this.localStream;
    }
  }

  /** Subscribe to call events */
  on(event: CallEventType, handler: CallEventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /** Get current local stream */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /** Clean up all resources */
  cleanup(): void {
    this.connected = false;

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────

  private async getUserMedia(type: CallType): Promise<MediaStream> {
    const video = type === 'video';
    return navigator.mediaDevices.getUserMedia({ audio: true, video });
  }

  private async createPeerConnection(): Promise<void> {
    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal('ice_candidate', {
          callId: this.callId!,
          candidate: JSON.stringify(event.candidate),
          sdpMid: event.candidate.sdpMid ?? undefined,
          sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined,
        });
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.emit('stream', event.streams[0]);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc?.connectionState === 'connected') {
        this.connected = true;
        if (this.timeoutTimer) {
          clearTimeout(this.timeoutTimer);
          this.timeoutTimer = null;
        }
        this.emit('connected', { callId: this.callId });
      } else if (this.pc?.connectionState === 'failed' || this.pc?.connectionState === 'disconnected') {
        this.emit('ended', { callId: this.callId });
        this.cleanup();
      }
    };
  }

  private addLocalTracks(): void {
    if (!this.pc || !this.localStream) return;
    this.localStream.getTracks().forEach((track) => {
      this.pc!.addTrack(track, this.localStream!);
    });
  }

  private sendSignal(cmd: string, body: Record<string, unknown>): void {
    const ws = getWSClient();
    ws.send({ cmd, seq: Date.now(), body });
  }

  private listenForSignaling(): void {
    const ws = getWSClient();

    const unsubOffer = ws.on('offer_sdp', (data) => {
      const body = (data as { body: SdpBody }).body;
      if (!body || !this.pc) return;
      this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(body.sdp)))
        .catch(() => this.emit('error', { message: 'Failed to set remote description' }));
    });

    const unsubAnswer = ws.on('answer_sdp', (data) => {
      const body = (data as { body: SdpBody }).body;
      if (!body || !this.pc) return;
      this.pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(body.sdp)))
        .catch(() => this.emit('error', { message: 'Failed to set remote description' }));
    });

    const unsubIce = ws.on('ice_candidate', (data) => {
      const body = (data as { body: IceCandidateBody }).body;
      if (!body || !this.pc) return;
      const candidate = JSON.parse(body.candidate);
      this.pc.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(() => this.emit('error', { message: 'Failed to add ICE candidate' }));
    });

    this.unsubs.push(unsubOffer, unsubAnswer, unsubIce);
  }

  private emit(event: CallEventType, data: unknown): void {
    this.handlers.get(event)?.forEach((handler) => handler(data));
  }
}
