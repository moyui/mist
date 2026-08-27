export type VisualCommandType = 'line' | 'band' | 'text' | 'icon';

export interface BaseVisualCommand {
  readonly id: string;
  readonly type: VisualCommandType;
  readonly layer: string;
}

export interface LineVisualCommand extends BaseVisualCommand {
  readonly type: 'line';
  readonly startIndex: number;
  readonly endIndex: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly startPrice: number;
  readonly endPrice: number;
  readonly color: string;
  readonly width?: number;
  readonly style?: 'solid' | 'dashed' | 'dotted';
}

export interface BandVisualCommand extends BaseVisualCommand {
  readonly type: 'band';
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly fromTime: string;
  readonly toTime: string;
  readonly top: number;
  readonly bottom: number;
  readonly color: string;
  readonly fill?: boolean;
  readonly gg?: number;
  readonly dd?: number;
}

export interface TextVisualCommand extends BaseVisualCommand {
  readonly type: 'text';
  readonly index: number;
  readonly time: string;
  readonly price: number;
  readonly text: string;
  readonly color: string;
  readonly position?: 'above' | 'below';
}

export interface IconVisualCommand extends BaseVisualCommand {
  readonly type: 'icon';
  readonly index: number;
  readonly time: string;
  readonly price: number;
  readonly shape: 'arrow_up' | 'arrow_down' | 'dot' | 'square';
  readonly color: string;
}

export type VisualCommand =
  | LineVisualCommand
  | BandVisualCommand
  | TextVisualCommand
  | IconVisualCommand;

export interface VisualCommandPayload {
  readonly code: string;
  readonly period: number;
  readonly source: string;
  readonly totalKlines: number;
  readonly commands: readonly VisualCommand[];
}
