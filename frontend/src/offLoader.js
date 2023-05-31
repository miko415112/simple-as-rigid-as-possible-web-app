export function readOFFFile(fileData) {
  const lines = fileData.split("\n");

  const [numVertices, numFaces, numEdges] = lines[1]
    .trim()
    .split(" ")
    .map(Number);

  const positions = [];
  const indices = [];

  for (let i = 2; i < 2 + numVertices; i++) {
    const vertexData = lines[i].trim().split(" ").map(Number);
    const position = vertexData.slice(0, 3);
    positions.push(...position);
  }

  for (let i = 2 + numVertices; i < 2 + numVertices + numFaces; i++) {
    const faceData = lines[i].trim().split(" ").map(Number);
    const numFaceVertices = faceData[0];
    const faceIndices = faceData.slice(1, numFaceVertices + 1);
    indices.push(...faceIndices);
  }

  return {
    positions: new Float32Array(positions),
    indices: indices,
  };
}
