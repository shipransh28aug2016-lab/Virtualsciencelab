// In-memory artifact store. Tools add binary results via ctx.artifacts.add(blob, filename).

const MIME = {
  html: 'text/html', md: 'text/markdown', txt: 'text/plain', json: 'application/json', csv: 'text/csv',
  js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', pdf: 'application/pdf', zip: 'application/zip',
  png: 'image/png', jpg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** @param {string} filename */
export function mimeFor(filename) {
  const ext = String(filename).split('.').pop().toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

export function createArtifacts(bus) {
  const map = new Map();
  let n = 0;
  const info = (a) => { const { blob, ...rest } = a; return rest; };
  return {
    /** @returns {{id,filename,mime,size,blobRef}} */
    add(blob, filename, meta = {}) {
      const id = 'art_' + (++n) + '_' + Math.random().toString(36).slice(2, 6);
      const filename_ = filename || id;
      const rec = {
        id, filename: filename_, mime: (blob && blob.type) || mimeFor(filename_),
        size: blob && (blob.size ?? blob.byteLength ?? blob.length) || 0, blobRef: id, created: Date.now(), ...meta, blob,
      };
      map.set(id, rec);
      bus?.emit('artifact', info(rec));
      return info(rec);
    },
    get(id) { return map.get(id); },
    list() { return [...map.values()].map(info); },
    url(id) {
      const a = map.get(id);
      return a && typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(a.blob) : null;
    },
    remove(id) { return map.delete(id); },
  };
}
