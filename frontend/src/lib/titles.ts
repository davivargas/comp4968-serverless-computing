// Placeholder job titles, grouped by career track. Replace with the real list
// (ideally fetched from the backend). Order within a track = seniority.
export interface TitleGroup { track: string; titles: string[] }

export const TITLE_GROUPS: TitleGroup[] = [
  {
    track: 'Engineering',
    titles: [
      'Software Engineer 1', 'Software Engineer 2', 'Senior Software Engineer',
      'Principal Software Engineer', 'Senior Principal Software Engineer',
    ],
  },
  { track: 'Management', titles: ['Engineering Manager', 'Senior Engineering Manager', 'Director of Engineering'] },
  { track: 'IT', titles: ['IT Administrator'] },
]

export const DEFAULT_TITLE = 'Software Engineer 1'
