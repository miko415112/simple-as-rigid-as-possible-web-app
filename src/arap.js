import { Matrix, SingularValueDecomposition, solve } from "ml-matrix";

const geometry_map = new Map();
const iteration = 10;

export function preprocess(geometry) {
  const verticesMatrix = getVerticesFromGeometry(geometry);
  const adjacentList = getAdjacentListFromGeometry(geometry);
  const weightMatrix = getWeightFromVerticesAndNeighbor(
    verticesMatrix,
    adjacentList
  );
  const LaplacianMatrix = getLaplacianMatrixFromWeightAndAdjacentList(
    weightMatrix,
    adjacentList
  );
  geometry_map.set(geometry, {
    verticesMatrix,
    adjacentList,
    weightMatrix,
    LaplacianMatrix,
  });
}

export function applyConstraints(geometry_constraint_map) {
  geometry_constraint_map.forEach((constraintArray, geometry) => {
    if (constraintArray.length == 0) return;
    const newVerticesMatrix = geometry_map.get(geometry).verticesMatrix.clone();
    const newRotationMatrix = [];
    for (var i = 0; i < iteration; i++) {
      calNewRotationMatrix(geometry, newVerticesMatrix, newRotationMatrix);
      calNewVerticesMatrix(
        constraintArray,
        geometry,
        newVerticesMatrix,
        newRotationMatrix
      );
    }
    const positionsAttribute = bufferGeometry.getAttribute("position");
    const newVertices2DArray = newVerticesMatrix.to2DArray();
    positionsAttribute.array = new Float32Array(newVertices2DArray.flat());
    positionsAttribute.needsUpdate = true;
  });
}

function calNewRotationMatrix(geometry, newVerticesMatrix, newRotationMatrix) {
  const { verticesMatrix, adjacentList, weightMatrix } =
    geometry_map.get(geometry);
  /* calNewRotationMatrix for each vertex */
  for (var i = 0; i < verticesMatrix.rows; i++) {
    const neighbors_id = adjacentList[i];
    const P_array = [];
    const diag_array = [];
    const P_prime_array = [];
    for (var j = 0; j < neighbors_id.length; j++) {
      var e_ij = verticesMatrix
        .getRowVector(i)
        .sub(verticesMatrix.getRowVector(neighbors_id[j]));
      var e_ij_prime = newVerticesMatrix
        .getRowVector(i)
        .sub(newVerticesMatrix.getRowVector(neighbors_id[j]));

      P_array.push(e_ij.to1DArray());
      P_prime_array.push(e_ij_prime.to1DArray());
      diag_array.push(weightMatrix.get(i, neighbors_id[j]));
    }

    const P_matrix = new Matrix(P_array).transpose();
    const P_prime_matrix = new Matrix(P_prime_array).transpose();
    const D_matrix = Matrix.diag(diag_array);
    const S_matrix = P_matrix.mmul(D_matrix).mmul(P_prime_matrix.transpose());

    const result = new SingularValueDecomposition(S_matrix);
    const Sigma = result.diagonal;
    const U = result.leftSingularVectors;
    const V_T = result.rightSingularVectors;
    const R = V_T.transpose().mmul(U.transpose());
    newRotationMatrix.push(R);
  }
}

function calNewVerticesMatrix(
  constraintArray,
  geometry,
  newVerticesMatrix,
  newRotationMatrix
) {
  const { verticesMatrix, adjacentList, weightMatrix, LaplacianMatrix } =
    geometry_map.get(geometry);
  const vertices_num = verticesMatrix.rows;
  const constraint_num = constraintArray.length;

  /* cal constraintLaplacianMatrix */
  const constraintLaplacianMatrix = Matrix.zeros(
    vertices_num + constraint_num,
    vertices_num + constraint_num
  );

  for (var i = 0; i < vertices_num; i++) {
    for (var j = 0; j < vertices_num; j++) {
      constraintLaplacianMatrix.set(i, j, LaplacianMatrix.get(i, j));
    }
  }

  for (var i = 0; i < constraint_num; i++) {
    const controlIndex = constraintArray[i].vertexIndex;
    constraintLaplacianMatrix.set(vertices_num + i, controlIndex, 1);
    constraintLaplacianMatrix.set(controlIndex, vertices_num + i, 1);
  }

  /* cal bMatrix */
  const bMatrix = Matrix.zeros(vertices_num + constraint_num, 1);
  for (var i = 0; i < vertices_num; i++) {
    const neighbors_id = adjacentList[i];
    var b_i_value = 0;
    for (var j = 0; j < neighbors_id.length; j++) {
      const weight_ij = weightMatrix.get(i, neighbors_id[j]);
      const Ri_plus_Rj = newRotationMatrix[i].add(newRotationMatrix[j]);
      const e_ij = verticesMatrix
        .getRowVector(i)
        .sub(verticesMatrix.getRowVector(j))
        .transpose();

      b_i_value += Ri_plus_Rj.mmul(e_ij)
        .mul(0.5 * weight_ij)
        .get(0, 0);
    }
    bMatrix.set(i, 1, b_i_value);
  }
  for (var i = 0; i < constraint_num; i++) {
    const constrol_sphere = constraintArray[i].sphere;
    const p_prime = constrol_sphere.worldToLocal(constrol_sphere.position);
    bMatrix.set(i + vertices_num, 1, p_prime);
  }

  const result = new SingularValueDecomposition(
    constraintLaplacianMatrix
  ).solve(bMatrix);

  for (var i = 0; i < vertices_num; i++) {
    for (var j = 0; j < vertices_num; j++) {
      newVerticesMatrix.set(i, j, result.get(i, j));
    }
  }
}

function getVerticesFromGeometry(geometry) {
  const positionAttribute = geometry.getAttribute("position");
  const positionArray = positionAttribute.array;
  const vertices2DArray = [];

  for (var i = 0; i < positionArray.length / 3; i++) {
    const x = positionArray[i * 3 + 0];
    const y = positionArray[i * 3 + 1];
    const z = positionArray[i * 3 + 2];
    vertices2DArray.push([x, y, z]);
  }

  const verticesMatrix = new Matrix(vertices2DArray);
  return verticesMatrix;
}

function getAdjacentListFromGeometry(geometry) {
  const adjacentList = [];
  const TriangleIndexArray = geometry.index.array;

  for (var i = 0; i < TriangleIndexArray.length / 3; i++) {
    const vertexID_a = TriangleIndexArray[i * 3 + 0];
    const vertexID_b = TriangleIndexArray[i * 3 + 1];
    const vertexID_c = TriangleIndexArray[i * 3 + 2];
    addToAdjacentList(vertexID_a, vertexID_b, vertexID_c, adjacentList);
    addToAdjacentList(vertexID_b, vertexID_a, vertexID_c, adjacentList);
    addToAdjacentList(vertexID_c, vertexID_a, vertexID_b, adjacentList);
  }

  return adjacentList;
}

function addToAdjacentList(a, b, c, adjacentList, i) {
  if (adjacentList[a] != undefined) {
    if (!adjacentList[a].includes(b)) {
      adjacentList[a].push(b);
    }
    if (!adjacentList[a].includes(c)) {
      adjacentList[a].push(c);
    }
  } else {
    adjacentList[a] = [b, c];
  }
}

function getWeightFromVerticesAndNeighbor(verticesMatrix, adjacentList) {
  const weightMatrix = Matrix.zeros(verticesMatrix.rows, verticesMatrix.rows);
  for (var i = 0; i < verticesMatrix.rows; i++) {
    for (var j = 0; j < i; j++) {
      const vertex_i_neighbors = adjacentList[i];
      const vertex_j_neighbors = adjacentList[j];
      const commonNeighbors = vertex_i_neighbors.filter(
        (element) => vertex_j_neighbors.indexOf(element) !== -1
      );

      var weight = 0;
      for (var z = 0; z < commonNeighbors.length; z++) {
        const commonNeighbor = commonNeighbors[z];
        const v_i = verticesMatrix.getRowVector(i);
        const v_j = verticesMatrix.getRowVector(j);
        const v_c = verticesMatrix.getRowVector(commonNeighbor);
        const vector1 = v_i.sub(v_c);
        const vector2 = v_j.sub(v_c);
        const cos_value = vector1
          .mmul(vector2.transpose())
          .div(vector1.norm() * vector2.norm())
          .get(0, 0);
        const cot_value = cos_value / Math.sin(Math.acos(cos_value));
        weight += 0.5 * cot_value;
      }

      weightMatrix.set(i, j, weight);
      weightMatrix.set(j, i, weight);
    }
  }
  return weightMatrix;
}

function getLaplacianMatrixFromWeightAndAdjacentList(
  weightMatrix,
  adjacentList
) {
  const n = weightMatrix.rows;
  const LaplacianMatrix = Matrix.zeros(n, n);
  for (var i = 0; i < n; i++) {
    const vertex_i_neighbors_id = adjacentList[i];

    var vertex_i_weight_sum = 0;
    for (var j = 0; j < vertex_i_neighbors_id.length; j++) {
      const neighbor_id = vertex_i_neighbors_id[j];
      LaplacianMatrix.set(
        i,
        neighbor_id,
        -1 * weightMatrix.get(i, neighbor_id)
      );
      vertex_i_weight_sum += weightMatrix.get(i, neighbor_id);
    }
    LaplacianMatrix.set(i, i, vertex_i_weight_sum);
  }
  return LaplacianMatrix;
}
