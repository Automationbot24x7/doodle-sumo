import * as THREE from 'three';

// Tiny URDF loader for Lux3D articulation output: links (GLB meshes) + revolute / continuous / prismatic joints.
// Returns { root, joints: { name: { set(value), type, lower, upper } } }.
export async function loadURDF(base, loader) {
  const xml = new DOMParser().parseFromString(await (await fetch(base + 'robot.urdf')).text(), 'text/xml');
  const links = {}, root = new THREE.Group();
  await Promise.all([...xml.querySelectorAll('robot > link')].map(async (l) => {
    const g = new THREE.Group(); g.name = l.getAttribute('name'); links[g.name] = g;
    const mesh = l.querySelector('visual mesh');
    if (mesh) { const gl = await loader.loadAsync(base + mesh.getAttribute('filename').replace(/^meshes\//, '')); g.add(gl.scene); }
  }));
  const children = new Set(); const joints = {};
  for (const j of xml.querySelectorAll('robot > joint')) {
    const parent = links[j.querySelector('parent').getAttribute('link')];
    const child = links[j.querySelector('child').getAttribute('link')];
    const o = j.querySelector('origin');
    const xyz = (o?.getAttribute('xyz') || '0 0 0').trim().split(/\s+/).map(Number);
    const rpy = (o?.getAttribute('rpy') || '0 0 0').trim().split(/\s+/).map(Number);
    const axis = new THREE.Vector3(...(j.querySelector('axis')?.getAttribute('xyz') || '1 0 0').trim().split(/\s+/).map(Number)).normalize();
    const lim = j.querySelector('limit');
    const frame = new THREE.Group(); frame.position.set(...xyz); frame.rotation.set(rpy[0], rpy[1], rpy[2], 'ZYX');
    const pivot = new THREE.Group(); frame.add(pivot); pivot.add(child); parent.add(frame); children.add(child.name);
    const type = j.getAttribute('type');
    joints[j.getAttribute('name')] = {
      type, axis, lower: lim ? +lim.getAttribute('lower') : -Infinity, upper: lim ? +lim.getAttribute('upper') : Infinity, value: 0,
      set(v) {
        this.value = v;
        if (type === 'prismatic') pivot.position.copy(axis).multiplyScalar(v);
        else pivot.quaternion.setFromAxisAngle(axis, v);
      },
    };
  }
  for (const [n, g] of Object.entries(links)) if (!children.has(n)) root.add(g);
  return { root, joints };
}
