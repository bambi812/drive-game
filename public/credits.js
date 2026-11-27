// credits.js - the 3D car models are used under Creative Commons licences that require naming their authors.
const MODELS = [
  ['2013 Subaru BRZ', 'Ddiaz Design', 'CC-BY-NC-SA-4.0', 'https://sketchfab.com/3d-models/2013-subaru-brz-9619c092b4dd496a978dee79194da288'],
  ['2024 Subaru BRZ tS', 'Ddiaz Design', 'CC-BY-NC-SA-4.0', 'https://sketchfab.com/3d-models/2024-subaru-brz-ts-7bccb635920343d9b03823bf09cb0f43'],
  ['(FREE) Porsche 911 Carrera 4S', 'Karol Miklas', 'CC-BY-SA-4.0', 'https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf'],
  ['2024 Porsche 992 GT3 R', 'Dave Love SketchFab', 'CC-BY-4.0', 'https://sketchfab.com/3d-models/2024-porsche-992-gt3-r-b76c9b2ae2d548c3869426eac4ab8a19'],
  ['Dodge Challenger SRT Hellcat 2015', 'preslav.petkov0606', 'CC-BY-4.0', 'https://sketchfab.com/3d-models/dodge-challenger-srt-hellcat-2015-94208b77d32a4934afd88f52615fd4b8'],
  ['2019 BMW M2 Competition', 'Ddiaz Design', 'CC-BY-NC-SA-4.0', 'https://sketchfab.com/3d-models/2019-bmw-m2-competition-e43741a793da4e3f8e9747e31a1a8ff6'],
  ['2021 BMW M4 Competition', 'Ricy', 'CC-BY-NC-4.0', 'https://sketchfab.com/3d-models/2021-bmw-m4-competition-d3f07b471d9f4a2c9a2acf79d88a3645'],
  ['2017 Mclaren 720s', '_Sheep19', 'CC-BY-4.0', 'https://sketchfab.com/3d-models/2017-mclaren-720s-f7bece69400f4640a4a3be746b44998b'],
  ['2018 Ford Mustang GT', 'Ddiaz Design', 'CC-BY-NC-SA-4.0', 'https://sketchfab.com/3d-models/2018-ford-mustang-gt-75509e00007b462b9b77cb02759c2478'],
  ['Mazda RX-7 (Car)', 'Anokino', 'CC-BY-4.0', 'https://sketchfab.com/3d-models/mazda-rx-7-car-404b2aefdf084f01bc3d75559c9c4088'],
  ['2020 Toyota GR Supra', 'Ddiaz Design', 'CC-BY-NC-SA-4.0', 'https://sketchfab.com/3d-models/2020-toyota-gr-supra-4b829105275f4e06a824fad6d1eaf259'],
  ['Toyota Supra MK IV (1994)', 'Martin Trafas', 'CC-BY-4.0', 'https://sketchfab.com/3d-models/toyota-supra-mk-iv-1994-eb9bb1eb41db431cb078088ae1ce45f8'],
  ["Mazda Miata MX-5 NA", "Lexyc16", 'CC-BY-4.0', "https://sketchfab.com/3d-models/mazda-miata-mx-5-na-d51fcd44b74f4daf8012c41e0400c041"],
  ["Toyota Corolla Levin AE92 GT APEX Kouki", "Nix_Dektara", 'CC-BY-4.0', "https://sketchfab.com/3d-models/toyota-corolla-levin-ae92-gt-apex-kouki-66dcbaf822ae47468655a604a83af703"],
  ["Toyota AE86 Sprinter Trueno Zenki", "Martin Trafas", 'CC-BY-4.0', "https://sketchfab.com/3d-models/toyota-ae86-sprinter-trueno-zenki-a5737bf3cc9b4179a6e5ebe173ff70d9"],
  ["[FREE] Datsun 280Z", "Martin Trafas", 'CC-BY-4.0', "https://sketchfab.com/3d-models/free-datsun-280z-0789ab2ece9442de94b3c41595e0ecbd"],
  ["Nissan Skyline GT-R C110 Kenmeri '73", "Martin Trafas", 'CC-BY-4.0', "https://sketchfab.com/3d-models/nissan-skyline-gt-r-c110-kenmeri-73-1a950b81ee274a0eb8014bd84ba047f5"],
  ["[FREE] BMW M3 E30", "Martin Trafas", 'CC-BY-4.0', "https://sketchfab.com/3d-models/free-bmw-m3-e30-ac3c7013434e403e8faff87948caf422"],
  ["LOTUS ÉLISE", "Stéphane Agullo", 'CC-BY-4.0', "https://sketchfab.com/3d-models/lotus-elise-75e9045ac1af4cdbb69318108c81edfd"],
  ["Mercedes-Benz 300 SL Gullwing", "Lexyc16", 'CC-BY-4.0', "https://sketchfab.com/3d-models/mercedes-benz-300-sl-gullwing-505241c829c540a4921533000736904e"],
  ["FREE 1975 Porsche 911 (930) Turbo", "Lionsharp Studios", 'CC-BY-4.0', "https://sketchfab.com/3d-models/free-1975-porsche-911-930-turbo-8568d9d14a994b9cae59499f0dbed21e"],
  ["Honda NSX 1990", "Lexyc16", 'CC-BY-4.0', "https://sketchfab.com/3d-models/honda-nsx-1990-1cc15628a00a4739a6b6c01128927c8d"],
  ["Nissan Skyline R34 GT-R", "Lexyc16", 'CC-BY-4.0', "https://sketchfab.com/3d-models/nissan-skyline-r34-gt-r-ff8fb2251dfa4bb9979e7022c5a6666c"],
  ["2015 - Porsche 911 Carrera S | Mid-Poly", "chiwei", 'CC-BY-4.0', "https://sketchfab.com/3d-models/2015-porsche-911-carrera-s-mid-poly-4cef7c1e22ab40fd937507eae9a62cd8"],
  ["Chevrolet Corvette (C7)", "Martin Trafas", 'CC-BY-4.0', "https://sketchfab.com/3d-models/chevrolet-corvette-c7-2b509d1bce104224b147c81757f6f43a"],
  ["Ford Mustang Shelby GT500", "Jiaxing", 'CC-BY-4.0', "https://sketchfab.com/3d-models/ford-mustang-shelby-gt500-0eaa7a16796540f29461ddae05ecdeb3"],
  ["Mclaren P1 | www.vecarz.com", "vecarz", 'CC-BY-4.0', "https://sketchfab.com/3d-models/mclaren-p1-wwwvecarzcom-adae2edc721e4ce7b31c1d06a581e30a"],
  ["1989 Chevrolet Suburban", "Randomness", 'CC-BY-4.0', "https://sketchfab.com/3d-models/1989-chevrolet-suburban-44bdb8317f0840b3bc858e606f86db6b"],
];
export function showCredits() {
  if (document.getElementById('credits')) return;
  const box = document.createElement('div'); box.id = 'credits';
  const card = document.createElement('div'), title = document.createElement('h3'), close = document.createElement('button'); title.textContent = 'Car model credits'; close.type = 'button'; close.textContent = 'Close'; close.onclick = () => box.remove(); card.appendChild(title);
  for (const [name, author, licence, source] of MODELS) { const row = document.createElement('p'), a = document.createElement('a'); a.href = source; a.target = '_blank'; a.rel = 'noopener'; a.textContent = name; row.append(a, ' by ' + author + ' - ' + licence); card.appendChild(row); }
  const note = document.createElement('p'); note.textContent = 'Brand and model names belong to their owners. This is a free fan project.'; card.append(note, close); box.appendChild(card); document.body.appendChild(box);
}
