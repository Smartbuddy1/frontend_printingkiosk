const fs = require('fs');

async function transliteratePhrase(phrase) {
  if (!phrase || phrase.trim() === '') return phrase;
  
  const words = phrase.split(' ');
  const transliteratedWords = [];
  
  for (let w of words) {
    const match = w.match(/^([^a-zA-Z0-9]*)([a-zA-Z0-9_]+)([^a-zA-Z0-9]*)$/);
    if (!match) {
      transliteratedWords.push(w);
      continue;
    }
    const pre = match[1];
    const word = match[2];
    const post = match[3];
    
    if (!word) {
      transliteratedWords.push(w);
      continue;
    }
    
    try {
      const url = `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=hi-t-i0-und&num=1`;
      const response = await fetch(url);
      const json = await response.json();
      if (json[0] === 'SUCCESS' && json[1] && json[1][0] && json[1][0][1] && json[1][0][1][0]) {
        transliteratedWords.push(pre + json[1][0][1][0] + post);
      } else {
        transliteratedWords.push(pre + word + post);
      }
    } catch (e) {
      transliteratedWords.push(pre + word + post);
    }
  }
  
  return transliteratedWords.join(' ');
}

async function processFile() {
  let appJs = fs.readFileSync('app.js', 'utf8');
  
  // Pattern to match all rows in the translation arrays.
  // Using a replacer function with matchAll and manual replacement so we can await.
  const regex = /^(\s*)\["(.*?)", "(.*?)", "(.*?)"\](,)?$/gm;
  
  const matches = [...appJs.matchAll(regex)];
  
  let newAppJs = appJs;
  
  console.log(`Found ${matches.length} translations to replace.`);
  let count = 0;
  for (const match of matches) {
    const fullMatch = match[0];
    const whitespace = match[1];
    const english = match[2];
    
    const transliterated = await transliteratePhrase(english);
    
    const replacement = `${whitespace}["${english}", "${transliterated}", "${transliterated}"]${match[5] ? ',' : ''}`;
    newAppJs = newAppJs.replace(fullMatch, replacement);
    count++;
    if (count % 10 === 0) console.log(`Processed ${count}/${matches.length}`);
  }
  
  fs.writeFileSync('app_transliterated.js', newAppJs, 'utf8');
  console.log('Finished transliteration. Saved to app_transliterated.js');
}

processFile();
