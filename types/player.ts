export interface Player {
  id: string;
  name: string;
  joinedAt: string;
  isHost?: boolean;
  deviceId: string;
}
