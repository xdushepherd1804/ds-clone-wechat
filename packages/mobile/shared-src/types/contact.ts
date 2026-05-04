export type ContactStatus = 'active' | 'blocked' | 'deleted';

export interface ContactItem {
  id: string;
  userId: string;
  contactId: string;
  remark: string | null;
  tags: string[];
  status: ContactStatus;
  contact: {
    id: string;
    username: string;
    nickname: string;
    avatar: string | null;
    status: string;
  };
  createdAt: string;
}

export interface AddContactRequest {
  contactId: string;
  remark?: string;
  message?: string;
}

export interface UpdateContactRequest {
  remark?: string;
  tags?: string[];
  status?: ContactStatus;
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  toUid: string;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  fromUser: {
    id: string;
    nickname: string;
    avatar: string | null;
  };
  createdAt: string;
}

export interface SendFriendRequest {
  toUid: string;
  message?: string;
}

export interface HandleFriendRequest {
  action: 'accept' | 'reject';
}

export interface ContactSearchResult {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  isContact: boolean;
}
