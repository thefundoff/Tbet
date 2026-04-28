/**
 * API-Football league IDs for all major competitions.
 * Used to filter fixture results and avoid processing obscure leagues.
 */
export const MAJOR_LEAGUE_IDS: number[] = [
  // England
  39,   // Premier League
  40,   // Championship
  // Spain
  140,  // La Liga
  141,  // La Liga 2
  // Germany
  78,   // Bundesliga
  79,   // 2. Bundesliga
  // Italy
  135,  // Serie A
  136,  // Serie B
  // France
  61,   // Ligue 1
  62,   // Ligue 2
  // Netherlands
  88,   // Eredivisie
  // Portugal
  94,   // Primeira Liga
  // Turkey
  203,  // Süper Lig
  // Belgium
  144,  // Jupiler Pro League
  // Scotland
  179,  // Premiership
  // Greece
  197,  // Super League
  // Russia
  235,  // Premier League
  // Austria
  218,  // Bundesliga
  // Switzerland
  207,  // Super League
  // Denmark
  119,  // Superliga
  // Sweden
  113,  // Allsvenskan
  // Norway
  103,  // Eliteserien
  // Poland
  106,  // Ekstraklasa
  // Czech Republic
  345,  // Czech Liga
  // Romania
  283,  // Liga 1
  // Croatia
  210,  // HNL
  // Serbia
  286,  // Super Liga
  // Ukraine
  333,  // Premier League
  // UEFA
  2,    // UEFA Champions League
  3,    // UEFA Europa League
  848,  // UEFA Europa Conference League
  // South America
  13,   // Copa Libertadores
  11,   // Copa Sudamericana
  71,   // Brazil Série A
  72,   // Brazil Série B
  128,  // Argentina Primera División
  129,  // Argentina Primera División B
  // North America
  253,  // MLS (USA)
  262,  // Liga MX (Mexico)
  // Africa
  6,    // Africa Cup of Nations
  12,   // CAF Champions League
  29,   // CAF Confederation Cup
  // Asia
  17,   // AFC Champions League
  // Saudi Arabia
  307,  // Saudi Pro League
  // World
  1,    // World Cup
  4,    // Euro Championship
]

/**
 * League processing priority for buildPredictions.
 * Lower number = processed first. Leagues with reliable team statistics
 * (European top flights, UEFA) are prioritised so the fixture pool stays
 * high-quality even when MAX_FIXTURES_PER_BUILD caps the slice.
 * Leagues not listed here fall back to priority 99.
 */
export const LEAGUE_PRIORITY: Record<number, number> = {
  2:   1,   // UEFA Champions League
  3:   2,   // UEFA Europa League
  848: 3,   // UEFA Conference League
  39:  4,   // Premier League
  140: 5,   // La Liga
  135: 6,   // Serie A
  78:  7,   // Bundesliga
  61:  8,   // Ligue 1
  88:  9,   // Eredivisie
  94:  10,  // Primeira Liga
  203: 11,  // Süper Lig
  40:  12,  // Championship
  141: 13,  // La Liga 2
  136: 14,  // Serie B
  79:  15,  // 2. Bundesliga
  62:  16,  // Ligue 2
  144: 17,  // Jupiler Pro League
  179: 18,  // Scottish Premiership
  197: 19,  // Greek Super League
  235: 20,  // Russian Premier League
  307: 21,  // Saudi Pro League
  253: 22,  // MLS
  262: 23,  // Liga MX
}

/**
 * Maps API-Football league IDs to The Odds API sport keys.
 * Only leagues available on The Odds API free tier are included.
 */
export const LEAGUE_TO_SPORT_KEY: Record<number, string> = {
  39:  'soccer_england_premier_league',
  40:  'soccer_england_efl_champ',
  140: 'soccer_spain_la_liga',
  141: 'soccer_spain_segunda_division',
  78:  'soccer_germany_bundesliga',
  79:  'soccer_germany_bundesliga2',
  135: 'soccer_italy_serie_a',
  136: 'soccer_italy_serie_b',
  61:  'soccer_france_ligue_one',
  62:  'soccer_france_ligue_two',
  88:  'soccer_netherlands_eredivisie',
  94:  'soccer_portugal_primeira_liga',
  203: 'soccer_turkey_super_league',
  144: 'soccer_belgium_first_div',
  179: 'soccer_scotland_premiership',
  2:   'soccer_uefa_champs_league',
  3:   'soccer_uefa_europa_league',
  848: 'soccer_uefa_europe_conference_league',
}
