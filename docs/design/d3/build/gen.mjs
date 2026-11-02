// D3 시안 생성기 — node docs/design/d3/build/gen.mjs [a|b|c]
const which = process.argv.slice(2);
const all = which.length ? which : ['a', 'b', 'c'];
for (const k of all) {
  const mod = await import(`./concept-${k}.mjs`);
  const size = mod.build();
  console.log(`concept-${k}.html`, size, 'chars');
}
