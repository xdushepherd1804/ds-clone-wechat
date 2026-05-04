import { useCallback, useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons';
import { Modal, message } from 'antd';
import MessageList from '@/components/MessageList';
import ChatInput from '@/components/ChatInput';
import ImageViewer from '@/components/ImageViewer';
import MentionPicker from '@/components/MentionPicker';
import GroupAnnouncement from '@/components/GroupAnnouncement';
import GroupMemberList from '@/components/GroupMemberList';
import { useMessages } from '@/hooks/useMessages';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useMessageRead } from '@/hooks/useMessageRead';
import { useGroupInfo } from '@/hooks/useGroupInfo';
import { useGroupMembers } from '@/hooks/useGroupMembers';
import { useGroupActions } from '@/hooks/useGroupActions';
import { useChatStore, useUserStore } from '@/store';
import { ChatType } from '@/types';
import type { GroupMember, GroupRole } from '@/types';

export function GroupChatPage() {
  const { group_id } = useParams<{ group_id: string }>();
  const navigate = useNavigate();
  const groupId = group_id || '';

  const userId = useUserStore((s) => s.user?.id) || '';
  const draftInput = useChatStore((s) => s.draftInputs[groupId] || '');
  const { setDraftInput } = useChatStore.getState();

  const { groupInfo, refresh: refreshGroup } = useGroupInfo(groupId);
  const { members, refresh: refreshMembers } = useGroupMembers(groupId);
  const groupActions = useGroupActions(groupId);

  const { messages, hasMore, loadingMore, loadMore, recallMessage } = useMessages(groupId);
  const { sendText, sendImage, sendFile, sendVoice } = useSendMessage(groupId);
  const { isTyping, onInputChange } = useTypingIndicator(groupId, ChatType.GROUP);
  const { markRead } = useMessageRead(groupId, ChatType.GROUP);

  const [showMembers, setShowMembers] = useState(false);
  const [mentionState, setMentionState] = useState<{
    active: boolean;
    filterText: string;
    startIndex: number;
  }>({ active: false, filterText: '', startIndex: 0 });
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const myRole = groupInfo?.myRole || 'member';
  const isOwner = myRole === 'owner';
  const isAdminOrOwner = myRole === 'owner' || myRole === 'admin';

  const memberNames: Record<string, string> = {};
  for (const m of members) {
    memberNames[m.userId] = (m.nicknameInGroup || m.userId);
  }

  const handleInputChange = useCallback(
    (val: string) => {
      setDraftInput(groupId, val);
      onInputChange();

      const ta = document.querySelector('textarea');
      if (!ta) return;

      const cursorPos = ta.selectionStart;
      const textBeforeCursor = val.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@([^@\s]*)$/);

      if (atMatch) {
        setMentionState({
          active: true,
          filterText: atMatch[1],
          startIndex: atMatch.index!,
        });
      } else {
        setMentionState((prev) => (prev.active ? { ...prev, active: false } : prev));
      }
    },
    [groupId, setDraftInput, onInputChange],
  );

  const handleMentionSelect = useCallback(
    (member: GroupMember) => {
      const name = (member.nicknameInGroup || member.userId);
      const beforeMention = draftInput.slice(0, mentionState.startIndex);
      const afterCursor = draftInput.slice(
        mentionState.startIndex + mentionState.filterText.length + 1,
      );
      const newVal = `${beforeMention}@${name} ${afterCursor}`;
      setDraftInput(groupId, newVal);
      setMentionState({ active: false, filterText: '', startIndex: 0 });

      requestAnimationFrame(() => {
        const ta = document.querySelector('textarea');
        if (ta) {
          const newCursor = mentionState.startIndex + name.length + 2;
          ta.focus();
          ta.selectionStart = ta.selectionEnd = newCursor;
        }
      });
    },
    [groupId, draftInput, mentionState, setDraftInput],
  );

  const handleMentionAll = useCallback(() => {
    const beforeMention = draftInput.slice(0, mentionState.startIndex);
    const afterCursor = draftInput.slice(
      mentionState.startIndex + mentionState.filterText.length + 1,
    );
    const newVal = `${beforeMention}@所有人 ${afterCursor}`;
    setDraftInput(groupId, newVal);
    setMentionState({ active: false, filterText: '', startIndex: 0 });
  }, [groupId, draftInput, mentionState, setDraftInput]);

  const handleSendText = useCallback(() => {
    const text = draftInput.trim();
    if (!text) return;
    sendText(text, ChatType.GROUP);
    setDraftInput(groupId, '');
    markRead();
  }, [draftInput, sendText, setDraftInput, groupId, markRead]);

  const handleSendImage = useCallback(
    (url: string) => {
      sendImage(url, ChatType.GROUP);
      markRead();
    },
    [sendImage, markRead],
  );

  const handleSendFile = useCallback(
    (url: string, name: string, size: number) => {
      sendFile(url, name, size, ChatType.GROUP);
      markRead();
    },
    [sendFile, markRead],
  );

  const handleSendVoice = useCallback(
    (blob: Blob, duration: number) => {
      const reader = new FileReader();
      reader.onload = () => {
        sendVoice(reader.result as string, duration, ChatType.GROUP);
        markRead();
      };
      reader.readAsDataURL(blob);
    },
    [sendVoice, markRead],
  );

  const handleRecall = useCallback(
    (msgId: string) => {
      recallMessage(msgId);
    },
    [recallMessage],
  );

  const handleKickMember = useCallback(
    async (member: GroupMember) => {
      Modal.confirm({
        title: '移出成员',
        content: `确定要将 ${(member.nicknameInGroup || member.userId)} 移出群聊吗？`,
        okText: '确定',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          const ok = await groupActions.removeMember(member.userId);
          if (ok) {
            message.success('已移出群聊');
            refreshMembers();
          } else {
            message.error('操作失败');
          }
        },
      });
    },
    [groupActions, refreshMembers],
  );

  const handleChangeRole = useCallback(
    async (member: GroupMember, role: GroupRole) => {
      const ok = await groupActions.changeMemberRole(member.userId, role);
      if (ok) {
        message.success(role === 'admin' ? '已设为管理员' : '已取消管理员');
        refreshMembers();
      } else {
        message.error('操作失败');
      }
    },
    [groupActions, refreshMembers],
  );

  const handleSendMessageToMember = useCallback(
    (member: GroupMember) => {
      navigate(`/chat/${member.userId}`);
    },
    [navigate],
  );

  if (!groupId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
        无效的群聊ID
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', flex: 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, maxWidth: 900, margin: '0 auto', minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 16px',
            background: '#ededed',
            borderBottom: '1px solid #ddd',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => navigate('/chat')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ArrowLeftOutlined style={{ fontSize: 18, color: '#333' }} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {groupInfo?.name || '群聊'}
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>
              {groupInfo ? `${groupInfo.memberCount} 人` : ''}
              {isTyping && <span style={{ color: '#07c160', marginLeft: 8 }}>有人正在输入...</span>}
            </div>
          </div>

          <button
            onClick={() => setShowMembers(!showMembers)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <TeamOutlined style={{ fontSize: 18, color: '#333' }} />
          </button>

          <button
            onClick={() => navigate(`/chat/group/${groupId}/settings`)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <SettingOutlined style={{ fontSize: 18, color: '#333' }} />
          </button>
        </div>

        {/* Announcement */}
        <GroupAnnouncement announcement={groupInfo?.announcement || null} />

        {/* Messages */}
        <MessageList
          messages={messages}
          hasMore={hasMore}
          loadingMore={loadingMore}
          loadMore={loadMore}
          onRecall={handleRecall}
          onImageClick={() => {}}
          chatType={ChatType.GROUP}
          memberNames={memberNames}
        />

        {/* Chat Input with Mention */}
        <div style={{ position: 'relative' }}>
          <MentionPicker
            visible={mentionState.active}
            members={members}
            filterText={mentionState.filterText}
            onSelect={handleMentionSelect}
            onClose={() => setMentionState({ active: false, filterText: '', startIndex: 0 })}
            isAdminOrOwner={isAdminOrOwner}
            onSelectAll={handleMentionAll}
          />
          <ChatInput
            value={draftInput}
            onChange={handleInputChange}
            onSendText={handleSendText}
            onSendImage={handleSendImage}
            onSendFile={handleSendFile}
            onSendVoice={handleSendVoice}
            onInputChange={() => {}}
          />
        </div>

        <ImageViewer />
      </div>

      {/* Member List Sidebar */}
      <GroupMemberList
        visible={showMembers}
        members={members}
        currentUserId={userId}
        isOwner={isOwner}
        isAdmin={myRole === 'admin'}
        onClose={() => setShowMembers(false)}
        onKickMember={handleKickMember}
        onChangeRole={handleChangeRole}
        onSendMessage={handleSendMessageToMember}
      />
    </div>
  );
}
