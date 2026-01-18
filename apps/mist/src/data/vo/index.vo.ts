export class IndexVo {
  id: number;
  symbol: string;
  time: Date;
  amount: number;
  volume?: string;
  open: number;
  close: number;
  highest: number;
  lowest: number;
  createTime: Date;
  updateTime: Date;
}
