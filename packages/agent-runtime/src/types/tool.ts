/**
 * Tool 层类型占位。
 *
 * 见 design.md「Tool Layer」章节，详细字段由 Task 3.x 补全。
 */

export interface ChunkHit {
  chunkId: string
  chunkIndex: number
  headingPath: string[]
  content: string
  score: number
}
