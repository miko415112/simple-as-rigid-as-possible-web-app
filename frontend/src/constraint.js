export class Constraint {
  constructor(control_mesh, control_vertexID, represent_mesh) {
    this.control_mesh = control_mesh;
    this.control_vertexID = control_vertexID;
    this.represent_mesh = represent_mesh;
  }
  s;
  getLocalPos() {
    return this.control_mesh
      .worldToLocal(this.represent_mesh.position)
      .toArray();
  }
  getWorldPos() {
    return this.represent_mesh.position.toArray();
  }

  setWorldPos(pos) {
    this.represent_mesh.position.copy(new Vector3(pos));
  }

  setReadyColor() {
    this.represent_mesh.material.color.set(0x00ff00);
  }

  setUnReadyColor() {
    this.represent_mesh.material.color.set(0xff0000);
  }
}
