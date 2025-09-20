import { Player } from './player';

export interface Game {
  id: string;
  game: string;
  host: string;
}

export interface GameData {
  id: string;
  game: string;
  host: string;
  players?: { [key: string]: Player };
  status: string;
  createdAt: string;
}

export type GameStatus = 'waiting' | 'in-progress' | 'finished';
