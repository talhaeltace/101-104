import sharp from 'sharp';

const p = 'C:/xampp/htdocs/projects/public/MapFlow_icon.png';
const meta = await sharp(p).metadata();
console.log(JSON.stringify({ path: p, width: meta.width, height: meta.height }, null, 2));
