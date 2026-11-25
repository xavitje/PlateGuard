/**
 * The demo menu of Brasserie De Haven: ingredients with their allergens, components (recipe
 * parts) and dishes. Invented for the demo; allergens follow the usual recipe, not a supplier
 * sheet. The seed adds whatever of this is missing, so a demo location that already exists
 * gets new dishes and fuller recipes too.
 */

export interface SeedIngredient {
  name: string;
  contains?: string[];
  mayContain?: string[];
  /** Other names waiters type, mostly Dutch. */
  synonyms?: string[];
  unverified?: boolean;
}

export interface SeedComponent {
  name: string;
  nl: string;
  ingredients: string[];
  omittable?: boolean;
  premixed?: boolean;
  suitableForSevere?: boolean;
  /** Prepared in the fryer, whose oil carries fish and crustaceans. */
  fryer?: boolean;
  /** Components the kitchen can swap this one for. */
  substitutions?: string[];
}

export interface SeedDish {
  name: string;
  nl: string;
  course: number;
  priceCents: number;
  components: string[];
  category: string;
  subcategory: string | null;
}

export const FRYER = { name: 'Fryer 1', allergens: ['FISH', 'CRUSTACEANS'] };

export const INGREDIENTS: Record<string, SeedIngredient> = {
  // Meat, fish and shellfish
  beef: { name: 'Beef', synonyms: ['rundvlees', 'biefstuk', 'ossenhaas'] },
  chicken: { name: 'Chicken breast', synonyms: ['kipfilet', 'kip'] },
  anchovy: { name: 'Anchovy', contains: ['FISH'], synonyms: ['ansjovis'] },
  bass: { name: 'Sea bass', contains: ['FISH'], synonyms: ['zeebaars'], unverified: true },
  salmon: { name: 'Salmon', contains: ['FISH'], synonyms: ['zalm'] },
  cod: { name: 'Cod', contains: ['FISH'], synonyms: ['kabeljauw'] },
  shrimp: {
    name: 'Brown shrimp',
    contains: ['CRUSTACEANS'],
    synonyms: ['garnalen', 'grijze garnalen', 'shrimp', 'prawns'],
  },
  mussels: { name: 'Mussels', contains: ['MOLLUSCS'], synonyms: ['mosselen'] },
  squid: { name: 'Squid', contains: ['MOLLUSCS'], synonyms: ['inktvis', 'calamaris', 'calamari'] },

  // Dairy and eggs
  butter: { name: 'Butter', contains: ['MILK'], synonyms: ['boter', 'roomboter'] },
  cream: { name: 'Cream', contains: ['MILK'], synonyms: ['room', 'slagroom', 'kookroom'] },
  milk: { name: 'Milk', contains: ['MILK'], synonyms: ['melk'] },
  parmesan: {
    name: 'Parmesan',
    contains: ['MILK'],
    synonyms: ['parmezaan', 'parmigiano', 'kaas'],
  },
  goatCheese: { name: 'Goat cheese', contains: ['MILK'], synonyms: ['geitenkaas', 'kaas'] },
  cheddar: { name: 'Cheddar', contains: ['MILK'], synonyms: ['kaas'] },
  gruyere: { name: 'Gruyère', contains: ['MILK'], synonyms: ['gruyere', 'kaas'] },
  eggYolk: { name: 'Egg yolk', contains: ['EGGS'], synonyms: ['eidooier', 'egg', 'ei'] },
  egg: { name: 'Egg', contains: ['EGGS'], synonyms: ['ei', 'eieren', 'eggs'] },

  // Bread, flour and starch
  flour: {
    name: 'Wheat flour',
    contains: ['GLUTEN_WHEAT'],
    synonyms: ['tarwebloem', 'bloem', 'tarwe', 'wheat'],
  },
  bread: { name: 'Bread', contains: ['GLUTEN_WHEAT'], synonyms: ['brood', 'stokbrood'] },
  panko: {
    name: 'Panko breadcrumbs',
    contains: ['GLUTEN_WHEAT'],
    synonyms: ['paneermeel', 'panko'],
  },
  brioche: {
    name: 'Brioche bun',
    contains: ['GLUTEN_WHEAT', 'EGGS', 'MILK'],
    mayContain: ['SESAME'],
    synonyms: ['briochebroodje', 'broodje', 'bun'],
  },
  gfBun: {
    name: 'Gluten-free bun',
    contains: ['EGGS'],
    synonyms: ['glutenvrij broodje'],
  },
  naan: {
    name: 'Naan bread',
    contains: ['GLUTEN_WHEAT', 'MILK'],
    synonyms: ['naan', 'naanbrood'],
  },
  starch: { name: 'Corn starch', synonyms: ['maizena', 'maiszetmeel'] },
  tapioca: { name: 'Tapioca starch', synonyms: ['tapiocazetmeel', 'tapioca'] },
  rice: { name: 'Rice', synonyms: ['rijst', 'risottorijst', 'arborio'] },
  oats: { name: 'Oat flakes', contains: ['GLUTEN_OATS'], synonyms: ['havermout', 'haver'] },

  // Vegetables, fruit and herbs
  potato: { name: 'Potato', synonyms: ['aardappel', 'aardappelen', 'patat'] },
  tomato: {
    name: 'Tomato',
    mayContain: ['CELERY'],
    synonyms: ['tomaat', 'tomaten', 'tomatoes'],
  },
  lettuce: { name: 'Romaine', synonyms: ['sla', 'lettuce', 'romaine'] },
  rocket: { name: 'Rocket', synonyms: ['rucola', 'arugula'] },
  spinach: { name: 'Spinach', synonyms: ['spinazie'] },
  onion: { name: 'Onion', synonyms: ['ui', 'uien'] },
  shallot: { name: 'Shallot', synonyms: ['sjalot', 'sjalotten'] },
  garlic: { name: 'Garlic', synonyms: ['knoflook'] },
  celery: {
    name: 'Celery',
    contains: ['CELERY'],
    synonyms: ['selderij', 'bleekselderij', 'knolselderij'],
  },
  mushroom: {
    name: 'Chestnut mushrooms',
    synonyms: ['kastanjechampignons', 'champignons', 'paddenstoelen', 'mushrooms'],
  },
  beetroot: { name: 'Beetroot', synonyms: ['rode biet', 'biet'] },
  cucumber: { name: 'Cucumber', synonyms: ['komkommer'] },
  chickpeas: { name: 'Chickpeas', synonyms: ['kikkererwten'] },
  chili: { name: 'Red chili', synonyms: ['rode peper', 'chilipeper', 'chili'] },
  ginger: { name: 'Ginger', synonyms: ['gember'] },
  lemon: { name: 'Lemon', synonyms: ['citroen'] },
  apple: { name: 'Apple', synonyms: ['appel', 'appels'] },
  strawberry: { name: 'Strawberries', synonyms: ['aardbeien', 'aardbei'] },
  capers: { name: 'Capers', synonyms: ['kappertjes'] },
  parsley: { name: 'Parsley', synonyms: ['peterselie'] },
  basil: { name: 'Basil', synonyms: ['basilicum'] },
  thyme: { name: 'Thyme', synonyms: ['tijm'] },

  // Nuts, seeds and sauces
  peanuts: { name: 'Peanuts', contains: ['PEANUTS'], synonyms: ['pinda', "pinda's", 'pindakaas'] },
  walnuts: { name: 'Walnuts', contains: ['NUTS_WALNUT'], synonyms: ['walnoten', 'walnoot'] },
  almondFlour: {
    name: 'Almond flour',
    contains: ['NUTS_ALMOND'],
    synonyms: ['amandelmeel', 'amandel', 'amandelen'],
  },
  soySauce: {
    name: 'Soy sauce',
    contains: ['SOYBEANS', 'GLUTEN_WHEAT'],
    synonyms: ['sojasaus', 'ketjap', 'soja'],
  },
  mustard: { name: 'Dijon mustard', contains: ['MUSTARD'], synonyms: ['mosterd', 'dijon'] },
  curryPaste: {
    name: 'Curry paste',
    mayContain: ['MUSTARD', 'CELERY'],
    synonyms: ['currypasta', 'kerrie'],
  },
  coconutMilk: { name: 'Coconut milk', synonyms: ['kokosmelk', 'kokos'] },
  chocolate: {
    name: 'Dark chocolate',
    contains: ['SOYBEANS'],
    mayContain: ['MILK', 'NUTS'],
    synonyms: ['pure chocolade', 'chocolade', 'chocolate'],
  },

  // Stocks, wine and oils
  vealStock: { name: 'Veal stock', contains: ['CELERY'], synonyms: ['kalfsfond', 'fond'] },
  vegStock: {
    name: 'Vegetable stock',
    contains: ['CELERY'],
    synonyms: ['groentebouillon', 'bouillon'],
  },
  whiteWine: { name: 'White wine', contains: ['SULPHITES'], synonyms: ['witte wijn', 'wijn'] },
  beer: { name: 'Beer', contains: ['GLUTEN_BARLEY'], synonyms: ['bier', 'pils'] },
  oliveOil: { name: 'Olive oil', synonyms: ['olijfolie'] },
  sunflowerOil: { name: 'Sunflower oil', synonyms: ['zonnebloemolie', 'frituurolie'] },

  // Pantry
  salt: { name: 'Salt', synonyms: ['zout'] },
  pepper: { name: 'Black pepper', synonyms: ['zwarte peper', 'peper'] },
  sugar: { name: 'Sugar', synonyms: ['suiker'] },
  honey: { name: 'Honey', synonyms: ['honing'] },
  vanilla: { name: 'Vanilla', synonyms: ['vanille'] },
  cinnamon: { name: 'Cinnamon', synonyms: ['kaneel'] },
  nutmeg: { name: 'Nutmeg', synonyms: ['nootmuskaat'] },
};

export const COMPONENTS: Record<string, SeedComponent> = {
  // Meat
  steak: { name: 'Steak', nl: 'Biefstuk', ingredients: ['beef', 'sunflowerOil', 'salt', 'pepper'] },
  jus: {
    name: 'Jus',
    nl: 'Jus',
    ingredients: ['flour', 'vealStock', 'shallot', 'thyme'],
    substitutions: ['gfJus'],
  },
  gfJus: {
    name: 'GF jus',
    nl: 'Glutenvrije jus',
    ingredients: ['starch', 'shallot', 'thyme'],
    suitableForSevere: true,
  },
  carpaccio: {
    name: 'Carpaccio',
    nl: 'Carpaccio',
    ingredients: ['beef', 'oliveOil', 'salt', 'pepper'],
  },
  patty: {
    name: 'Burger patty',
    nl: 'Hamburger',
    ingredients: ['beef', 'onion', 'salt', 'pepper'],
  },
  satay: {
    name: 'Chicken satay',
    nl: 'Kipsaté',
    ingredients: ['chicken', 'soySauce', 'garlic', 'ginger', 'sunflowerOil'],
  },

  // Fish and shellfish
  bass: { name: 'Sea bass', nl: 'Zeebaars', ingredients: ['bass', 'oliveOil', 'lemon', 'salt'] },
  salmon: { name: 'Salmon fillet', nl: 'Zalmfilet', ingredients: ['salmon', 'oliveOil', 'salt'] },
  cod: {
    name: 'Beer-battered cod',
    nl: 'Kabeljauw in bierbeslag',
    ingredients: ['cod', 'flour', 'beer', 'salt'],
    fryer: true,
  },
  croquettes: {
    name: 'Shrimp croquettes',
    nl: 'Garnalenkroketten',
    ingredients: ['shrimp', 'butter', 'flour', 'milk', 'egg', 'panko'],
    fryer: true,
  },
  calamari: {
    name: 'Fried calamari',
    nl: 'Gefrituurde inktvis',
    ingredients: ['squid', 'flour', 'salt'],
    fryer: true,
  },
  mussels: {
    name: 'Mussels in white wine',
    nl: 'Mosselen in witte wijn',
    ingredients: ['mussels', 'whiteWine', 'onion', 'celery', 'garlic', 'parsley', 'butter'],
  },
  prawnCrackers: {
    name: 'Prawn crackers',
    nl: 'Kroepoek',
    ingredients: ['shrimp', 'tapioca', 'sunflowerOil'],
    omittable: true,
    fryer: true,
  },

  // Vegetarian
  risotto: {
    name: 'Risotto',
    nl: 'Risotto',
    ingredients: [
      'rice',
      'butter',
      'mushroom',
      'onion',
      'parmesan',
      'vegStock',
      'whiteWine',
      'thyme',
    ],
    premixed: true,
  },
  curry: {
    name: 'Vegetable curry',
    nl: 'Groentecurry',
    ingredients: [
      'chickpeas',
      'coconutMilk',
      'curryPaste',
      'onion',
      'garlic',
      'ginger',
      'spinach',
      'chili',
    ],
    premixed: true,
  },
  goatCheese: {
    name: 'Warm goat cheese',
    nl: 'Warme geitenkaas',
    ingredients: ['goatCheese', 'honey', 'thyme'],
  },

  // Soups and salads
  soup: {
    name: 'Soup',
    nl: 'Soep',
    ingredients: ['tomato', 'onion', 'garlic', 'vegStock', 'oliveOil', 'basil', 'cream'],
    premixed: true,
  },
  onionSoup: {
    name: 'Onion soup',
    nl: 'Uiensoep',
    ingredients: ['onion', 'vealStock', 'butter', 'whiteWine', 'thyme'],
    premixed: true,
  },
  cheeseCrouton: {
    name: 'Cheese crouton',
    nl: 'Kaascrouton',
    ingredients: ['bread', 'gruyere'],
    omittable: true,
  },
  lettuce: { name: 'Lettuce', nl: 'Sla', ingredients: ['lettuce'] },
  rocket: { name: 'Rocket', nl: 'Rucola', ingredients: ['rocket'], omittable: true },
  croutons: {
    name: 'Croutons',
    nl: 'Croutons',
    ingredients: ['bread', 'oliveOil', 'garlic'],
    omittable: true,
  },
  dressing: {
    name: 'Dressing',
    nl: 'Dressing',
    ingredients: ['anchovy', 'eggYolk', 'parmesan', 'lemon', 'garlic', 'mustard', 'oliveOil'],
  },
  parmesan: {
    name: 'Parmesan shavings',
    nl: 'Parmezaanschilfers',
    ingredients: ['parmesan'],
    omittable: true,
  },
  walnuts: {
    name: 'Candied walnuts',
    nl: 'Gekonfijte walnoten',
    ingredients: ['walnuts', 'sugar'],
    omittable: true,
  },
  beetroot: {
    name: 'Roasted beetroot',
    nl: 'Geroosterde rode biet',
    ingredients: ['beetroot', 'oliveOil', 'thyme'],
  },
  sideSalad: {
    name: 'Side salad',
    nl: 'Gemengde salade',
    ingredients: ['lettuce', 'tomato', 'cucumber', 'oliveOil', 'lemon'],
  },

  // Sauces
  truffleMayo: {
    name: 'Truffle mayonnaise',
    nl: 'Truffelmayonaise',
    ingredients: ['eggYolk', 'sunflowerOil', 'mustard', 'lemon'],
    omittable: true,
  },
  mayo: {
    name: 'Mayonnaise',
    nl: 'Mayonaise',
    ingredients: ['eggYolk', 'sunflowerOil', 'mustard', 'lemon'],
    omittable: true,
  },
  garlicMayo: {
    name: 'Garlic mayonnaise',
    nl: 'Knoflookmayonaise',
    ingredients: ['eggYolk', 'sunflowerOil', 'garlic', 'lemon'],
    omittable: true,
  },
  tartare: {
    name: 'Tartare sauce',
    nl: 'Tartaarsaus',
    ingredients: ['eggYolk', 'sunflowerOil', 'mustard', 'capers', 'parsley'],
    omittable: true,
  },
  burgerSauce: {
    name: 'Burger sauce',
    nl: 'Burgersaus',
    ingredients: ['eggYolk', 'sunflowerOil', 'mustard', 'tomato', 'sugar'],
    omittable: true,
  },
  peanutSauce: {
    name: 'Peanut sauce',
    nl: 'Pindasaus',
    ingredients: ['peanuts', 'soySauce', 'coconutMilk', 'chili', 'sugar'],
  },
  beurreBlanc: {
    name: 'Beurre blanc',
    nl: 'Beurre blanc',
    ingredients: ['butter', 'cream', 'whiteWine', 'shallot'],
    substitutions: ['lemonOil'],
  },
  lemonOil: {
    name: 'Lemon olive oil',
    nl: 'Citroen-olijfolie',
    ingredients: ['oliveOil', 'lemon', 'parsley'],
    suitableForSevere: true,
  },
  herbButter: {
    name: 'Herb butter',
    nl: 'Kruidenboter',
    ingredients: ['butter', 'garlic', 'parsley'],
    omittable: true,
  },

  // Sides
  fries: {
    name: 'Fries',
    nl: 'Friet',
    ingredients: ['potato', 'sunflowerOil', 'salt'],
    omittable: true,
    fryer: true,
  },
  mash: {
    name: 'Mashed potatoes',
    nl: 'Aardappelpuree',
    ingredients: ['potato', 'butter', 'milk', 'nutmeg', 'salt'],
  },
  spinach: { name: 'Spinach', nl: 'Spinazie', ingredients: ['spinach', 'garlic', 'oliveOil'] },
  whiteRice: { name: 'White rice', nl: 'Witte rijst', ingredients: ['rice', 'salt'] },
  naan: { name: 'Naan', nl: 'Naan', ingredients: ['naan'], omittable: true },
  bread: { name: 'Bread', nl: 'Brood', ingredients: ['bread'] },
  brioche: {
    name: 'Brioche bun',
    nl: 'Briochebroodje',
    ingredients: ['brioche'],
    substitutions: ['gfBun'],
  },
  gfBun: {
    name: 'Gluten-free bun',
    nl: 'Glutenvrij broodje',
    ingredients: ['gfBun'],
    suitableForSevere: true,
  },
  cheddar: { name: 'Cheddar', nl: 'Cheddar', ingredients: ['cheddar'], omittable: true },
  garnish: {
    name: 'Burger garnish',
    nl: 'Garnituur',
    ingredients: ['lettuce', 'tomato', 'onion'],
    omittable: true,
  },
  lemonWedge: {
    name: 'Lemon wedge',
    nl: 'Partje citroen',
    ingredients: ['lemon'],
    omittable: true,
  },

  // Desserts
  iceCream: {
    name: 'Vanilla ice cream',
    nl: 'Vanille-ijs',
    ingredients: ['cream', 'milk', 'eggYolk', 'sugar', 'vanilla'],
  },
  chocSauce: {
    name: 'Chocolate sauce',
    nl: 'Chocoladesaus',
    ingredients: ['chocolate', 'cream'],
    omittable: true,
  },
  whippedCream: {
    name: 'Whipped cream',
    nl: 'Slagroom',
    ingredients: ['cream', 'sugar'],
    omittable: true,
  },
  cremeBrulee: {
    name: 'Crème brûlée',
    nl: 'Crème brûlée',
    ingredients: ['cream', 'eggYolk', 'sugar', 'vanilla'],
  },
  applePie: {
    name: 'Apple pie',
    nl: 'Appeltaart',
    ingredients: ['apple', 'flour', 'butter', 'sugar', 'egg', 'cinnamon', 'oats'],
  },
  fondant: {
    name: 'Chocolate fondant',
    nl: 'Chocoladefondant',
    ingredients: ['chocolate', 'butter', 'egg', 'sugar', 'almondFlour'],
  },
  sorbet: {
    name: 'Strawberry sorbet',
    nl: 'Aardbeiensorbet',
    ingredients: ['strawberry', 'sugar', 'lemon'],
  },
};

const STARTERS = 'Voorgerechten';
const MAINS = 'Hoofdgerechten';
const DESSERTS = 'Desserts';
const SIDES = 'Bijgerechten';

export const DISHES: SeedDish[] = [
  // Starters
  {
    name: 'Tomato soup',
    nl: 'Tomatensoep',
    course: 1,
    priceCents: 850,
    components: ['soup'],
    category: STARTERS,
    subcategory: 'Soepen',
  },
  {
    name: 'French onion soup',
    nl: 'Franse uiensoep',
    course: 1,
    priceCents: 950,
    components: ['onionSoup', 'cheeseCrouton'],
    category: STARTERS,
    subcategory: 'Soepen',
  },
  {
    name: 'Caesar salad',
    nl: 'Caesarsalade',
    course: 1,
    priceCents: 1250,
    components: ['lettuce', 'croutons', 'dressing'],
    category: STARTERS,
    subcategory: 'Salades',
  },
  {
    name: 'Goat cheese salad',
    nl: 'Salade geitenkaas',
    course: 1,
    priceCents: 1350,
    components: ['goatCheese', 'rocket', 'beetroot', 'walnuts'],
    category: STARTERS,
    subcategory: 'Salades',
  },
  {
    name: 'Beef carpaccio',
    nl: 'Carpaccio',
    course: 1,
    priceCents: 1450,
    components: ['carpaccio', 'truffleMayo', 'parmesan', 'rocket'],
    category: STARTERS,
    subcategory: 'Koud',
  },
  {
    name: 'Shrimp croquettes',
    nl: 'Garnalenkroketten',
    course: 1,
    priceCents: 1550,
    components: ['croquettes', 'lemonWedge'],
    category: STARTERS,
    subcategory: 'Warm',
  },
  {
    name: 'Fried calamari',
    nl: 'Calamares',
    course: 1,
    priceCents: 1150,
    components: ['calamari', 'garlicMayo', 'lemonWedge'],
    category: STARTERS,
    subcategory: 'Warm',
  },
  {
    name: 'Bread with herb butter',
    nl: 'Brood met kruidenboter',
    course: 1,
    priceCents: 650,
    components: ['bread', 'herbButter'],
    category: STARTERS,
    subcategory: 'Warm',
  },

  // Mains
  {
    name: 'Steak, jus and fries',
    nl: 'Biefstuk met jus en friet',
    course: 2,
    priceCents: 2650,
    components: ['steak', 'jus', 'fries'],
    category: MAINS,
    subcategory: 'Vlees',
  },
  {
    name: 'Cheeseburger',
    nl: 'Cheeseburger',
    course: 2,
    priceCents: 1950,
    components: ['patty', 'brioche', 'cheddar', 'burgerSauce', 'garnish', 'fries'],
    category: MAINS,
    subcategory: 'Vlees',
  },
  {
    name: 'Chicken satay',
    nl: 'Kipsaté',
    course: 2,
    priceCents: 1850,
    components: ['satay', 'peanutSauce', 'whiteRice', 'prawnCrackers'],
    category: MAINS,
    subcategory: 'Vlees',
  },
  {
    name: 'Special: sea bass',
    nl: 'Special: zeebaars',
    course: 2,
    priceCents: 2800,
    components: ['bass'],
    category: MAINS,
    subcategory: 'Vis',
  },
  {
    name: 'Salmon with beurre blanc',
    nl: 'Zalm met beurre blanc',
    course: 2,
    priceCents: 2450,
    components: ['salmon', 'beurreBlanc', 'spinach', 'mash'],
    category: MAINS,
    subcategory: 'Vis',
  },
  {
    name: 'Fish and chips',
    nl: 'Fish and chips',
    course: 2,
    priceCents: 2150,
    components: ['cod', 'fries', 'tartare', 'lemonWedge'],
    category: MAINS,
    subcategory: 'Vis',
  },
  {
    name: 'Mussels with fries',
    nl: 'Mosselen met friet',
    course: 2,
    priceCents: 2550,
    components: ['mussels', 'fries', 'mayo'],
    category: MAINS,
    subcategory: 'Vis',
  },
  {
    name: 'Mushroom risotto',
    nl: 'Paddenstoelenrisotto',
    course: 2,
    priceCents: 2150,
    components: ['risotto'],
    category: MAINS,
    subcategory: 'Vegetarisch',
  },
  {
    name: 'Vegetable curry',
    nl: 'Groentecurry',
    course: 2,
    priceCents: 1950,
    components: ['curry', 'whiteRice', 'naan'],
    category: MAINS,
    subcategory: 'Vegetarisch',
  },

  // Sides
  {
    name: 'Fries with mayonnaise',
    nl: 'Friet met mayonaise',
    course: 2,
    priceCents: 450,
    components: ['fries', 'mayo'],
    category: SIDES,
    subcategory: null,
  },
  {
    name: 'Side salad',
    nl: 'Gemengde salade',
    course: 2,
    priceCents: 450,
    components: ['sideSalad'],
    category: SIDES,
    subcategory: null,
  },

  // Desserts
  {
    name: 'Dame blanche',
    nl: 'Dame blanche',
    course: 3,
    priceCents: 850,
    components: ['iceCream', 'chocSauce', 'whippedCream'],
    category: DESSERTS,
    subcategory: 'IJs',
  },
  {
    name: 'Strawberry sorbet',
    nl: 'Aardbeiensorbet',
    course: 3,
    priceCents: 750,
    components: ['sorbet'],
    category: DESSERTS,
    subcategory: 'IJs',
  },
  {
    name: 'Crème brûlée',
    nl: 'Crème brûlée',
    course: 3,
    priceCents: 850,
    components: ['cremeBrulee'],
    category: DESSERTS,
    subcategory: 'Gebak',
  },
  {
    name: 'Apple pie',
    nl: 'Appeltaart',
    course: 3,
    priceCents: 650,
    components: ['applePie', 'whippedCream'],
    category: DESSERTS,
    subcategory: 'Gebak',
  },
  {
    name: 'Chocolate fondant',
    nl: 'Chocoladefondant',
    course: 3,
    priceCents: 950,
    components: ['fondant', 'iceCream'],
    category: DESSERTS,
    subcategory: 'Gebak',
  },
];
