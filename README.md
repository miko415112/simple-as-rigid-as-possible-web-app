2023 Final Project for Computer Graphics
This project focuses on deformation calculations using the "As Rigid As Possible" technique.

Features:

- Ability to load .off files as deformation targets.
- Ability to draw 2D shapes, which will be triangulated using Delaunay triangulation to form a mesh for deformation.
  Note: When drawing lines, releasing the mouse will automatically connect the endpoints, so there is no need to draw intersecting lines. The program will create closed curves on its own.
- When the number of triangles exceeds 1000, there might be noticeable delays in the calculations. For example, the provided cactus and armadillo models require some waiting time.

References :

- [https://github.com/afawa/As-Rigid-As-Possible-Surface-Modeling](https://github.com/afawa/As-Rigid-As-Possible-Surface-Modeling)
- [https://igl.ethz.ch/projects/ARAP/arap_web.pdf](https://igl.ethz.ch/projects/ARAP/arap_web.pdf)
