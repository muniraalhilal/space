'use client';
import type { RobotConfig } from '@space/shared';
import { Stage } from './Stage';
import { RobotModel, type RobotStatus } from './Robot';

export default function RobotPreview({ config, status = 'idle' }: { config: Partial<RobotConfig>; status?: RobotStatus }) {
  return (
    <Stage camera={{ position: [0.9, 1.1, 3.1], fov: 26 }} target={[0, 0.62, 0]} controls>
      <RobotModel config={config} status={status} />
    </Stage>
  );
}
