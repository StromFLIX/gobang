
export const validate = (moves: number[]): { result: boolean, state: (null | 'black' | 'white')[] } => {
  const filledPositions = new Set<number>()
  const currentState = new Array<(null | 'black' | 'white')>(15 * 15).fill(null)
  for (const [i, move] of moves.entries()) {
    const row = Math.floor(move / 15)
    const col = move % 15
    // Check if the move is already filled
    if (filledPositions.has(move)) {
      return { result: false, state: currentState }
    }
    // Remove cages
    for (const key of [...Array(9).keys()]) {
      const currentColor = i % 2 === 0 ? 'white' : 'black'
      const oppositeColor = i % 2 === 0 ? 'black' : 'white'
      const cageCheckRow = ((Math.floor(key / 3)) - 1) * 3
      const cageCheckCol = ((key % 3) - 1) * 3
      if (row + cageCheckRow >= 0 && row + cageCheckRow < 15 && col + cageCheckCol >= 0 && col + cageCheckCol < 15) {
        const cageCheckIndex = (row + cageCheckRow) * 15 + col + cageCheckCol
        // Check if there is a stone 2 cells away
        if (!filledPositions.has(cageCheckIndex)) {
          continue
        }
        // Check if the stone is the same color
        if (!(currentState[cageCheckIndex] === currentColor)) {
          continue
        }
        // Check if there are two stones of the other color in between
        const rowVector = cageCheckRow / 3
        const colVector = cageCheckCol / 3
        const firstStoneRow = row + rowVector
        const firstStoneCol = col + colVector
        const secondStoneRow = row + 2 * rowVector
        const secondStoneCol = col + 2 * colVector
        if (!(currentState[firstStoneRow * 15 + firstStoneCol] === oppositeColor)) {
          continue
        }
        if (!(currentState[secondStoneRow * 15 + secondStoneCol] === oppositeColor)) {
          continue
        }
        currentState[firstStoneRow * 15 + firstStoneCol] = null
        currentState[secondStoneRow * 15 + secondStoneCol] = null
        filledPositions.delete(firstStoneRow * 15 + firstStoneCol)
        filledPositions.delete(secondStoneRow * 15 + secondStoneCol)
      }

    }
    // Add the move to the board
    currentState[move] = i % 2 === 0 ? 'white' : 'black'
    filledPositions.add(move)
  }
  return { result: true, state: currentState }
}
