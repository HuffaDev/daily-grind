import { getDailyPuzzleNumber, mulberry32, seedForDateKey } from "@/platform/daily";

// Spectrum: each day, everyone places the same three things on a scale, like
// "Pizza" between Overrated and Underrated. You score by how close you land
// to the average of everyone in your server, so it's about reading the room.
// Pure: the browser builds the day's rounds itself; the server scores them.

export const ROUNDS = 3;
/** A mark is 0 (all the way left) to 100 (all the way right). */
export const MAX_MARK = 100;
export const POINTS_PER_ROUND = 200;
/** Missing the average by this much or more scores nothing for the round. */
export const ZERO_POINTS_MISS = 40;

/** Scales that fit nearly anything, left end first. */
export const SCALES: readonly [string, string][] = [
  ["Overrated", "Underrated"],
  ["Hated", "Loved"],
  ["Boring", "Exciting"],
  ["Useless", "Essential"],
  ["Scary", "Comforting"],
  ["Old-fashioned", "Modern"],
  ["Cheap", "Fancy"],
  ["Childish", "Grown-up"],
  ["Calm", "Chaotic"],
  ["Forgettable", "Iconic"],
  ["Gross", "Delightful"],
  ["Simple", "Complicated"],
  ["Quiet", "Loud"],
  ["Weird", "Normal"],
  ["Healthy", "Unhealthy"],
  ["Summer vibes", "Winter vibes"],
  ["Morning energy", "Night energy"],
  ["Dog person", "Cat person"],
  ["Villain energy", "Hero energy"],
  ["Introvert", "Extrovert"],
  ["Mild", "Intense"],
  ["Worse than it sounds", "Better than it sounds"],
];

/** Things nearly everyone has an opinion on. */
export const SUBJECTS: readonly string[] = [
  "Pizza", "Pineapple on pizza", "Cats", "Dogs", "Mondays", "Rainy days", "Karaoke", "Board games", "Chess",
  "Crosswords", "Sushi", "Coffee", "Tea", "Energy drinks", "Camping", "Theme parks", "The gym", "Yoga",
  "Socks with sandals", "Pumpkin spice", "Halloween", "Christmas music", "New Year's resolutions", "Birthdays",
  "Weddings", "Road trips", "Airports", "Cruises", "The beach", "Snow", "Thunderstorms", "Spiders", "Sharks",
  "Penguins", "Pigeons", "Geese", "Horses", "Clowns", "Magicians", "Mimes", "Ghost stories", "Horror movies",
  "Rom-coms", "Superhero movies", "Musicals", "Reality TV", "Cooking shows", "Anime", "Cartoons", "Video games",
  "Minecraft", "Tetris", "Group chats", "Voice messages", "Emojis", "Memes", "Podcasts", "Audiobooks", "Libraries",
  "Homework", "Group projects", "Math class", "History class", "Pop quizzes", "Naps", "Breakfast", "Brunch",
  "Midnight snacks", "Cereal", "Pancakes", "Waffles", "Bacon", "Broccoli", "Brussels sprouts", "Avocado toast",
  "Ketchup", "Mayo", "Hot sauce", "Cilantro", "Olives", "Mushrooms", "Garlic", "Ice cream", "Dark chocolate",
  "Candy corn", "Popcorn", "Cheese", "Tacos", "Burritos", "Ramen", "Salad", "Soup", "Hot dogs", "Fast food",
  "Food trucks", "Leftovers", "Microwaves", "Vacuuming", "Laundry", "Ironing", "Gardening", "Houseplants",
  "Scented candles", "Fireworks", "Bubble wrap", "Glitter", "Lego", "Rubik's cubes", "Jigsaw puzzles", "Selfies",
  "Skateboarding", "Bowling", "Mini golf", "Golf", "Soccer", "Basketball", "Baseball", "Fishing", "Hiking",
  "Running", "Swimming", "Roller coasters", "Zoos", "Museums", "Concerts", "Music festivals", "Dancing",
  "Singing in the shower", "Whistling", "Small talk", "Phone calls", "Email", "Alarm clocks", "The snooze button",
  "Daylight saving time", "Tuesdays", "Fridays", "Sundays", "Autumn", "Spring", "Sunsets", "Full moons",
  "Dinosaurs", "Robots", "Aliens", "Vampires", "Zombies", "Pirates", "Ninjas", "Wizards", "Dragons", "Unicorns",
  "Time travel", "Space travel", "The ocean", "Volcanoes", "Hammocks", "Bean bags", "Pillow forts", "Sleepovers",
  "Surprise parties", "Escape rooms", "Trivia night", "Puns", "Dad jokes", "Knock-knock jokes", "Mustaches",
  "Tattoos", "Sunglasses indoors", "Crocs", "Flip-flops", "Hoodies", "Neckties", "Pajamas", "Umbrellas",
  "Fanny packs", "Spreadsheets", "Printers", "Self-checkout", "Online shopping", "Thrift stores", "Garage sales",
];

export interface Round {
  subject: string;
  left: string;
  right: string;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Days walk through the subjects in one fixed shuffled order, so none repeats
// until every one has had its turn.
const SUBJECT_ORDER = shuffle(SUBJECTS, mulberry32(0x5bec7));

/** The day's rounds: three subjects, each on a different scale. */
export function dailyRounds(dateKey: string): Round[] {
  const day = getDailyPuzzleNumber(dateKey) - 1;
  const scales = shuffle(SCALES, mulberry32(seedForDateKey(dateKey))).slice(0, ROUNDS);
  return scales.map(([left, right], i) => {
    const index = (((day * ROUNDS + i) % SUBJECT_ORDER.length) + SUBJECT_ORDER.length) % SUBJECT_ORDER.length;
    return { subject: SUBJECT_ORDER[index], left, right };
  });
}

/** A round's points for a mark `miss` away from the average. */
export function roundPoints(miss: number): number {
  return Math.round(POINTS_PER_ROUND * Math.max(0, 1 - miss / ZERO_POINTS_MISS));
}

/** Each round's average mark across `players`' marks. */
export function averages(players: number[][]): number[] {
  return Array.from({ length: ROUNDS }, (_, i) => players.reduce((sum, marks) => sum + marks[i], 0) / players.length);
}

/** A player's points and average miss against the room's averages. */
export function scoreMarks(marks: number[], means: number[]): { points: number; averageMiss: number } {
  const misses = marks.map((mark, i) => Math.abs(mark - means[i]));
  return {
    points: misses.reduce((sum, miss) => sum + roundPoints(miss), 0),
    averageMiss: Math.round(misses.reduce((a, b) => a + b, 0) / misses.length),
  };
}

/** Whether `marks` is one whole-number mark per round, in range. */
export function validMarks(marks: unknown): marks is number[] {
  return (
    Array.isArray(marks) &&
    marks.length === ROUNDS &&
    marks.every((m) => Number.isInteger(m) && m >= 0 && m <= MAX_MARK)
  );
}
