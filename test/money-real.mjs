import "./chrome-mock.mjs";
const { readAmount, classify } = await import(new URL("../llm.js", import.meta.url).pathname);
const cases=[
 ["70 cash, can come tomorrow",70],["I can do 68 cash and pick up today",68],
 ["60 firm",60],["130 final",130],["$45",45],["would you do 50",50],
 ["how about 60, I can come tomorrow with cash",60],["1,200 cash",1200],
 ["30 bucks",30],["60",60],["2",2],
 ["is the seat 30 inches deep?",null],["I can come at 5pm",null],
 ["I'll be there in 20 minutes",null],["it's 2 years old right?",null],
 ["is this still available",null],["hi",null],
 ["can you deliver 5 miles",null],["it's 40% off retail",null],
];
let p=0;
for(const [txt,want] of cases){
  const got=readAmount(txt); const ok=got===want; if(ok)p++;
  console.log(`${ok?'ok  ':'FAIL'} ${String(got).padEnd(5)} exp ${String(want).padEnd(5)} "${txt}"`);
}
console.log(`\n${p}/${cases.length} — using the real readAmount from llm.js`);
