const fs = require('fs');
const path = require('path');

const replacements = [
  { pattern: /BERU/g, replacement: 'AXONIZ' },
  { pattern: /Beru/g, replacement: 'Axoniz' },
  { pattern: /beru/gi, replacement: 'axoniz' }, // catch any remaining
  { pattern: /Sovereign Local Agentic Intelligence/gi, replacement: 'Autonomous Local Agentic System' },
  { pattern: /Sovereign/g, replacement: 'Autonomous' },
  { pattern: /sovereign/gi, replacement: 'autonomous' },
  { pattern: /Shadow Army/gi, replacement: 'Worker Swarm' },
  { pattern: /The Ant King/gi, replacement: 'Core Engine' },
  { pattern: /Marshal's Eye/gi, replacement: 'Axodex Indexer' },
  { pattern: /Marshal/gi, replacement: 'System' },
  // Undo any axoniz replacement if we want exactly Axoniz
  { pattern: /axoniz\.yaml/g, replacement: 'default.yaml' }
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.yaml')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src').concat(walk('./docs')).concat(['./package.json']).concat(fs.readdirSync('.').filter(f => f.endsWith('.md')).map(f => './' + f));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  replacements.forEach(({pattern, replacement}) => {
    content = content.replace(pattern, replacement);
  });

  if (original !== content) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});

// Rename beru.yaml to default.yaml
const oldYaml = './src/roles/axoniz.yaml'; // it would have been replaced in memory or on disk? Wait, I replaced beru in filename in the text!
if (fs.existsSync('./src/roles/beru.yaml')) {
  fs.renameSync('./src/roles/beru.yaml', './src/roles/default.yaml');
  console.log('Renamed beru.yaml -> default.yaml');
}
if (fs.existsSync('./src/roles/axoniz.yaml')) {
  fs.renameSync('./src/roles/axoniz.yaml', './src/roles/default.yaml');
  console.log('Renamed axoniz.yaml -> default.yaml');
}
