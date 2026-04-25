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
  // UEFA
  2,    // UEFA Champions League
  3,    // UEFA Europa League
  848,  // UEFA Europa Conference League
  // World
  1,    // World Cup
  4,    // Euro Championship
]

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
