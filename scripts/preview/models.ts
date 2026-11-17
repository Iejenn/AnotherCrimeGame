import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const files = (new URLSearchParams(location.search).get('f') ?? '').split(',');
const loader = new GLTFLoader();
(async () => {
  const lines: string[] = [];
  for (const f of files) {
    try {
      const g = await loader.loadAsync(`/models/${f}.glb`);
      const b = new THREE.Box3().setFromObject(g.scene);
      const fx = (v: THREE.Vector3) => [v.x, v.y, v.z].map((n) => n.toFixed(2)).join(',');
      lines.push(`${f}: min ${fx(b.min)} max ${fx(b.max)}`);
    } catch (e) {
      lines.push(`${f}: ERROR ${e}`);
    }
  }
  document.getElementById('out')!.textContent = lines.join('\n');
  (window as unknown as { ready: boolean }).ready = true;
})();
