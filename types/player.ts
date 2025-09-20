export interface Player {
  id: string;
  name: string;
  joinedAt: string;
  isHost?: boolean;
  deviceId: string;
  role?: 'hider' | 'seeker' | null;
}
