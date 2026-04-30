/**
 * @wechat-clone/shared — shared types, constants, and utilities
 */

// placeholder type for user identity
export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
}

// placeholder type for message
export interface Message {
  id: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file';
  createdAt: number;
}
