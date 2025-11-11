// search/alias.ts

import { plain } from './tokens';

export const ALIAS: Record<string, string> = {
  [plain('KU')]: 'Kansas',
  [plain('Kansas')]: 'Kansas',
  [plain('Kansas University')]: 'Kansas',
  [plain('University of Kansas')]: 'Kansas',
  [plain('KSU')]: 'Kansas State',
  [plain('UNC')]: 'North Carolina',
  [plain('UConn')]: 'Connecticut',
  [plain('Ole Miss')]: 'Mississippi',
  [plain('Texas A & M')]: 'Texas A&M',
  [plain('Texas A and M')]: 'Texas A&M',
  [plain('UT')]: 'Tennessee',
  [plain('UT Knoxville')]: 'Tennessee',
  [plain("St John's")]: "St. John's",
  [plain('Saint Johns')]: "St. John's",
  [plain("Saint John's")]: "St. John's",
};

