export interface Game {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  status: 'waiting' | 'in-progress' | 'finished';
  timeLeft?: string;
}

export type GameStatus = 'waiting' | 'in-progress' | 'finished';
