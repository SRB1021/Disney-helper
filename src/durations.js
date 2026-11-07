// Ride lengths in minutes. ThemeParks.wiki doesn't provide them, so each row is one of:
//   checked  - matches the Wikipedia infobox duration for the Walt Disney World ride
//   estimate - approximate, from public ride info (walk-throughs, shows and slides are rougher)
// Rides matching no row get DEFAULT_MIN and are labeled "default". Users can override any ride in the app.
// (Wikipedia was ignored where its page described another park's version, e.g. Disneyland's Pirates.)
const DEFAULT_MIN = 5;
const C = true; // shorthand: value checked against Wikipedia

// [pattern, minutes, checked?] - first matching row wins, so specific rows come before generic ones.
const TABLE = [
  // Magic Kingdom
  [/seven dwarfs/, 3, C], [/space mountain/, 3], [/big thunder/, 4], [/tiana|splash mountain/, 11],
  [/haunted mansion/, 9], [/pirates of the caribbean/, 9], [/jungle cruise|jingle cruise/, 10],
  [/peter pan/, 3], [/small world/, 11], [/dumbo/, 2], [/mad tea/, 2], [/barnstormer/, 1, C],
  [/winnie the pooh|many adventures/, 4], [/under the sea|little mermaid/, 6], [/buzz lightyear/, 5], [/astro orbiter/, 2],
  [/carousel of progress/, 22], [/peoplemover/, 10], [/country bear/, 16], [/magic carpets/, 2, C],
  [/regal carrousel/, 2], [/tron/, 2], [/tiki room/, 16, C], [/hall of presidents/, 25], [/riverboat/, 17],
  [/railroad/, 20, C], [/laugh floor/, 15], [/treehouse/, 15], [/philharmagic/, 12, C], [/tom sawyer/, 10],
  [/main street vehicles/, 8], [/cinderella castle/, 10], [/pirate'?s adventure/, 30], [/enchanted tales with belle/, 20],
  [/casey jr/, 10], [/tomorrowland speedway/, 5],
  // Hollywood Studios
  [/rise of the resistance/, 18, C], [/slinky dog/, 3], [/runaway railway/, 9], [/tower of terror/, 5],
  [/rock .?n.? roller/, 3], [/smugglers run/, 5], [/toy story mania/, 6, C], [/star tours/, 5],
  [/swirling saucers/, 2], [/muppet/, 17], [/frozen sing/, 30], [/beauty and the beast sing-along/, 15], [/beauty and the beast/, 30],
  [/once upon a studio/, 10], [/vacation fun/, 10], [/olaf draws/, 10], [/walt disney presents/, 15],
  // EPCOT
  [/cosmic rewind/, 3, C], [/test track/, 5, C], [/frozen ever after/, 5], [/ratatouille/, 5, C], [/soarin/, 5],
  [/spaceship earth/, 15], [/mission: ?space/, 5], [/living with the land/, 15, C], [/gran fiesta/, 9],
  [/imagination/, 7], [/seas with nemo/, 5], [/turtle talk/, 14], [/journey of water/, 15],
  [/american adventure/, 29, C], [/impressions de france/, 18, C], [/canada far and wide|reflections of china/, 18],
  [/palais du cin[eé]ma/, 20], [/bruce'?s shark world/, 10], [/short film festival/, 15], [/kidcot/, 10],
  [/advanced training lab/, 15], [/imageworks/, 15], [/awesome planet/, 10], [/project tomorrow/, 15],
  [/seabase aquarium/, 20], [/house of the whispering willows/, 10],
  [/gallery/, 10],                       // EPCOT pavilion galleries (Gallery of Arts and History, Stave Church, ...)
  // Animal Kingdom
  [/flight of passage/, 6], [/na.?vi river/, 5], [/expedition everest/, 4], [/kilimanjaro/, 20],
  [/dinosaur/, 4], [/kali river/, 5, C], [/triceratop/, 2], [/lion king/, 30], [/finding nemo/, 40],
  [/wildlife express/, 8], [/gorilla falls/, 30], [/maharajah/, 30], [/primeval whirl/, 2],
  [/zootopia/, 25], [/discovery island trails/, 20], [/wilderness explorers/, 30], [/animal care at conservation/, 20],
  [/jumping junction/, 10], [/tree of life/, 10], [/oasis exhibits/, 15], [/bluey/, 20],
  // Water parks (slides ~2-5 min incl. the ride down; pools and lazy rivers are open-ended, so rough)
  [/castaway creek/, 30], [/cross country creek/, 25], [/surf pool/, 20], [/melt-away bay/, 15], [/ketchakiddee|tike'?s peak/, 15],
  [/ski patrol/, 15], [/chairlift/, 6], [/miss adventure falls|teamboat springs/, 5], [/gangplank/, 4],
  [/mayday falls|crush .?n.? gusher/, 3], [/humunga|keelhaul|slush gusher|toboggan|snow stormers|downhill double|bay slides/, 2],
  [/slide|slalom|rapids|flyer|run$|raft|tornado|plunge|summit|surf|wave|river|creek/, 3],
];

const norm = (name) => String(name || '').toLowerCase().replace(/[’‘]/g, "'");
const find = (name) => TABLE.find(([re]) => re.test(norm(name)));

// { minutes, source: 'checked' | 'estimate' | 'default' }
function rideInfo(name) {
  const hit = find(name);
  if (!hit) return { minutes: DEFAULT_MIN, source: 'default' };
  return { minutes: hit[1], source: hit[2] ? 'checked' : 'estimate' };
}
const rideDuration = (name) => rideInfo(name).minutes;
// The table's value, or null when the ride isn't in the table (so callers can tell a guess from a default).
const knownDuration = (name) => find(name)?.[1] ?? null;

module.exports = { rideDuration, rideInfo, knownDuration, DEFAULT_MIN };
