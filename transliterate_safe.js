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
  
  // Split app.js into lines
  const lines = appJs.split('\n');
  
  let inCust = false;
  let inAdmin = false;
  let count = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('const CUSTOMER_TRANSLATION_ROWS')) {
      inCust = true;
      continue;
    }
    if (line.includes('const ADMIN_TRANSLATION_ROWS')) {
      inAdmin = true;
      continue;
    }
    
    if (inCust || inAdmin) {
      if (line.trim() === '];') {
        if (inCust) inCust = false;
        else if (inAdmin) inAdmin = false;
        continue;
      }
      
      // Look for string translations only: `  ["English", "Hindi", "Marathi"],`
      const match = line.match(/^(\s*)\["(.*?)", "(.*?)", "(.*?)"\](,)?\r?$/);
      if (match) {
        const whitespace = match[1];
        const english = match[2];
        const transliterated = await transliteratePhrase(english);
        lines[i] = `${whitespace}["${english}", "${transliterated}", "${transliterated}"]${match[5] ? ',' : ''}`;
        count++;
        if (count % 10 === 0) console.log(`Processed ${count} lines`);
      }
    }
  }
  
  // Now apply the other fixes
  let newAppJs = lines.join('\n');
  
  // Fix nmc_27 PDF filename
  newAppJs = newAppJs.replace(/nmc_27_{10,30}bmw_{40,70}\.pdf/g, 'nmc_27_______________________bmw_______________________________________________________________.pdf');
  
  // Enable XFA forms rendering
  const oldStr = 'return pdfjsLib.getDocument({ url: file.previewUrl }).promise.then((pdf) => pdf.getPage(1));';
  const newStr = 'return pdfjsLib.getDocument({ url: file.previewUrl, enableXfa: true }).promise.then((pdf) => pdf.getPage(1));';
  newAppJs = newAppJs.replace(oldStr, newStr);
  
  fs.writeFileSync('app_transliterated_safe.js', newAppJs, 'utf8');
  console.log('Finished safe transliteration. Saved to app_transliterated_safe.js');
}

processFile();
