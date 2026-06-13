/** Quaternion → Euler angle conversion for the IMU live view. */

export interface Euler {
  /** Rotation about X, degrees. */
  roll: number;
  /** Rotation about Y, degrees. */
  pitch: number;
  /** Rotation about Z, degrees. */
  yaw: number;
}

/**
 * Convert a unit quaternion (r = scalar) to Tait-Bryan ZYX Euler angles in
 * degrees. Handy for a test bench: tilt the board and watch roll/pitch move.
 */
export function quatToEuler(q: { r: number; i: number; j: number; k: number }): Euler {
  const { r, i, j, k } = q;
  const toDeg = 180 / Math.PI;

  const roll = Math.atan2(2 * (r * i + j * k), 1 - 2 * (i * i + j * j));
  const sinPitch = Math.max(-1, Math.min(1, 2 * (r * j - k * i)));
  const pitch = Math.asin(sinPitch);
  const yaw = Math.atan2(2 * (r * k + i * j), 1 - 2 * (j * j + k * k));

  return { roll: roll * toDeg, pitch: pitch * toDeg, yaw: yaw * toDeg };
}
