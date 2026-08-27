import { Injectable } from '@nestjs/common';
import type { ChanK } from '@app/chancore';
import {
  ChanVisualAdapter,
  type ChanVisualOptions,
} from './adapters/chan-visual.adapter';
import type {
  VisualCommand,
  VisualCommandPayload,
} from './visual-command.types';

export interface GenerateVisualCommandsInput {
  readonly code: string;
  readonly period: number;
  readonly source: string;
  readonly klines: readonly ChanK[];
  readonly layers?: readonly string[];
  readonly chanOptions?: ChanVisualOptions;
}

@Injectable()
export class VisualCommandService {
  /**
   * Generates standard visual commands across requested layers.
   */
  generateCommands(input: GenerateVisualCommandsInput): VisualCommandPayload {
    const {
      code,
      period,
      source,
      klines,
      layers = ['chan'],
      chanOptions,
    } = input;

    const layerSet = new Set(layers.map((l) => l.toLowerCase()));
    const allCommands: VisualCommand[] = [];

    // 1. Chan Layer
    if (
      layerSet.has('chan') ||
      layerSet.has('chan_bi') ||
      layerSet.has('chan_duan') ||
      layerSet.has('chan_zs') ||
      layerSet.has('chan_bsp')
    ) {
      const chanCmds = ChanVisualAdapter.convert(klines, {
        ...chanOptions,
        includeBi: !layerSet.has('chan') ? layerSet.has('chan_bi') : true,
        includeDuan: !layerSet.has('chan') ? layerSet.has('chan_duan') : true,
        includeZhongshu: !layerSet.has('chan') ? layerSet.has('chan_zs') : true,
        includeBsp: !layerSet.has('chan') ? layerSet.has('chan_bsp') : true,
      });
      allCommands.push(...chanCmds);
    }

    return {
      code,
      period,
      source,
      totalKlines: klines.length,
      commands: Object.freeze(allCommands),
    };
  }
}
