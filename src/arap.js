import { Matrix, SingularValueDecomposition, determinant } from "ml-matrix";
import { SVD } from "svd-js";
const mesh_map = new Map();
const iteration = 3;

export function preprocess(mesh) {
  const verticesMatrix = getVerticesFromGeometry(mesh.geometry);
  const adjacentList = getAdjacentListFromGeometry(mesh.geometry);
  const weightMatrix = getWeightFromVerticesAndNeighbor(
    verticesMatrix,
    adjacentList
  );
  const LaplacianMatrix = getLaplacianMatrixFromWeightAndAdjacentList(
    weightMatrix,
    adjacentList
  );
  mesh_map.set(mesh, {
    verticesMatrix,
    adjacentList,
    weightMatrix,
    LaplacianMatrix,
  });
}

export function applyConstraints(constraintsArray) {
  /* iterate each map element(mesh) */
  mesh_map.forEach((mesh_data, mesh) => {
    const constraints_for_this_mesh = constraintsArray.filter((constraint) => {
      return constraint.control_mesh == mesh ? true : false;
    });

    if (constraints_for_this_mesh.length > 0) {
      const newVerticesMatrix = mesh_data.verticesMatrix.clone();
      const newRotationMatrix = [];

      for (var i = 0; i < iteration; i++) {
        calNewRotationMatrix(mesh_data, newVerticesMatrix, newRotationMatrix);
        calNewVerticesMatrix(
          constraints_for_this_mesh,
          mesh_data,
          newVerticesMatrix,
          newRotationMatrix
        );
      }
      const positionsAttribute = mesh.geometry.getAttribute("position");
      const newVertices2DArray = newVerticesMatrix.to2DArray();
      positionsAttribute.array = new Float32Array(newVertices2DArray.flat());
      positionsAttribute.needsUpdate = true;
    }
  });
}

function calNewRotationMatrix(mesh_data, newVerticesMatrix, newRotationMatrix) {
  const { verticesMatrix, adjacentList, weightMatrix } = mesh_data;
  /* calNewRotationMatrix for each vertex */
  for (var i = 0; i < verticesMatrix.rows; i++) {
    const neighbors_id = adjacentList[i];
    const P_array = [];
    const diag_array = [];
    const P_prime_array = [];

    for (var j of neighbors_id) {
      var e_ij = verticesMatrix
        .getRowVector(i)
        .clone()
        .sub(verticesMatrix.getRowVector(j));

      var e_ij_prime = newVerticesMatrix
        .getRowVector(i)
        .clone()
        .sub(newVerticesMatrix.getRowVector(j));

      P_array.push(e_ij.to1DArray());
      P_prime_array.push(e_ij_prime.to1DArray());
      diag_array.push(weightMatrix.get(i, j));
    }

    const P_matrix = new Matrix(P_array).transpose();
    const P_prime_matrix = new Matrix(P_prime_array).transpose();
    const D_matrix = Matrix.diag(diag_array);
    const S_matrix = P_matrix.mmul(D_matrix).mmul(P_prime_matrix.transpose());

    const { u, v, q } = SVD(S_matrix.to2DArray());
    const U = new Matrix(u);
    const V = new Matrix(v);
    var R = V.clone().mmul(U.clone().transpose());

    if (determinant(R) < 0) {
      const column = U.getColumnVector(0);
      column.mul(-1);
      U.setColumn(0, column);
    }
    R = V.clone().mmul(U.clone().transpose());
    newRotationMatrix[i] = R;
  }
  console.log(newRotationMatrix);
}

function calNewVerticesMatrix(
  constraintArray,
  mesh_data,
  newVerticesMatrix,
  newRotationMatrix
) {
  const { verticesMatrix, adjacentList, weightMatrix, LaplacianMatrix } =
    mesh_data;
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
    const controlIndex = constraintArray[i].control_vertexID;
    constraintLaplacianMatrix.set(vertices_num + i, controlIndex, 1);
    constraintLaplacianMatrix.set(controlIndex, vertices_num + i, 1);
  }

  /* cal bMatrix */
  const bMatrix = Matrix.zeros(vertices_num + constraint_num, 3);
  for (var i = 0; i < vertices_num; i++) {
    const neighbors_id = adjacentList[i];
    const b_i_column_vector = Matrix.zeros(3, 1);
    for (var j of neighbors_id) {
      const weight_ij = weightMatrix.get(i, j);
      const Ri_plus_Rj = newRotationMatrix[i].clone().add(newRotationMatrix[j]);
      const e_ij = verticesMatrix
        .getRowVector(i)
        .clone()
        .sub(verticesMatrix.getRowVector(j))
        .transpose();

      b_i_column_vector.add(Ri_plus_Rj.mmul(e_ij).mul(0.5 * weight_ij));
    }
    bMatrix.setRow(i, b_i_column_vector.transpose());
  }
  for (var i = 0; i < constraint_num; i++) {
    const constrol_pos = constraintArray[i].getLocalPos();
    bMatrix.setRow(i + vertices_num, constrol_pos);
  }

  console.log(bMatrix);
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
    const vertex_i_neighbors = adjacentList[i];
    for (var j of vertex_i_neighbors) {
      const vertex_j_neighbors = adjacentList[j];
      const commonNeighbors = vertex_i_neighbors.filter(
        (element) => vertex_j_neighbors.indexOf(element) !== -1
      );
      var weight = 0;
      for (var c of commonNeighbors) {
        const v_i = verticesMatrix.getRowVector(i).clone();
        const v_j = verticesMatrix.getRowVector(j).clone();
        const v_c = verticesMatrix.getRowVector(c).clone();
        const vector1 = v_i.sub(v_c);
        const vector2 = v_j.sub(v_c);
        const dotProduct = vector1
          .clone()
          .mmul(vector2.clone().transpose())
          .get(0, 0);
        const angleInRadians = Math.acos(
          dotProduct / (vector1.norm() * vector2.norm())
        );
        const cot_value = Math.cos(angleInRadians) / Math.sin(angleInRadians);
        weight += 0.5 * cot_value;
      }
      weightMatrix.set(i, j, weight);
    }
  }
  console.log("weightMatrix");
  console.log(weightMatrix);
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
    for (var j of vertex_i_neighbors_id) {
      LaplacianMatrix.set(i, j, -1 * weightMatrix.get(i, j));
      vertex_i_weight_sum += weightMatrix.get(i, j);
    }
    LaplacianMatrix.set(i, i, vertex_i_weight_sum);
  }
  console.log(LaplacianMatrix);
  return LaplacianMatrix;
}
