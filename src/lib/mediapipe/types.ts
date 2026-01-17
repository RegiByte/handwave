/** This was copied from the MediaPipe Tasks Vision library to avoid type conflicts. */
export interface Matrix {
  /** The number of rows. */
  rows: number
  /** The number of columns. */
  columns: number
  /** The values as a flattened one-dimensional array. */
  data: Array<number>
}
