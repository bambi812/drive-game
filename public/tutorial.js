// tutorial.js - a short, skippable walk-through shown once to new players (about a minute). Key names come from the current bindings.
import { keyName } from './settings.js';

const FLAG = 'tutorialDone';
export const tutorialSeen = () => !!localStorage.getItem(FLAG);
export function showTutorial(keys, touch) {
  if (document.getElementById('tutorial')) return;
  const k = a => (keys[a] ? keyName(keys[a]) : '-');
  const steps = [
    ['Driving', touch ? 'Hold the pedals on the right to accelerate and brake. Steer with the arrows on the left.' : `${k('throttle')} accelerates, ${k('brake')} brakes and reverses, ${k('left')} / ${k('right')} steer. ${k('reset')} puts you back on the road.`],
    ['Drifting', touch ? 'Turn in, tap HB, then hold the gas to keep the slide going. Do not hit anything or the points are lost.' : `Turn in, tap ${k('handbrake')}, then keep the gas on to hold the slide. Hit a wall and the points are lost. Orange drift zones pay money.`],
    ['The map', touch ? 'Tap MAP to see the whole world.' : `${k('map')} opens the map. Drag to move, scroll to zoom.`],
    ['GPS route', 'Click any place on the map, or one in the list on the left, and follow the purple line and the turn instructions.'],
    ['Garage', touch ? 'Drive into a glowing garage zone and tap the prompt to buy cars, upgrades and paint.' : `Drive into a glowing garage zone and press ${k('interact')} to buy cars, upgrades and paint.`],
    ['Races', touch ? 'Drive to a coloured light beam and tap the prompt to join. Winnings buy new cars.' : `Drive to a coloured light beam and press ${k('interact')} to join. ${k('leaveRace')} leaves. Winnings buy new cars.`],
  ];
  const box = document.createElement('div'); box.id = 'tutorial';
  const card = document.createElement('div'), title = document.createElement('h3'), text = document.createElement('p'), dots = document.createElement('div'), row = document.createElement('div');
  const skip = document.createElement('button'), next = document.createElement('button');
  skip.type = next.type = 'button'; skip.textContent = 'Skip'; skip.className = 'tskip'; next.className = 'tnext'; dots.className = 'tdots'; row.className = 'trow';
  row.append(skip, dots, next); card.append(title, text, row); box.appendChild(card); document.body.appendChild(box);
  let i = 0;
  const close = () => { localStorage.setItem(FLAG, '1'); box.remove(); };
  const draw = () => { title.textContent = `${i + 1}. ${steps[i][0]}`; text.textContent = steps[i][1]; next.textContent = i === steps.length - 1 ? 'Drive!' : 'Next'; dots.textContent = steps.map((_, j) => (j === i ? '\u25CF' : '\u25CB')).join(' '); };
  skip.onmousedown = next.onmousedown = e => e.preventDefault();
  skip.onclick = close; next.onclick = () => { if (++i >= steps.length) close(); else draw(); };
  draw();
}