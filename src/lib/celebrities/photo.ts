/** The 450×600 card copy stored next to each celebrity photo (see toCelebrityPhoto). */
export function cardUrl(photoUrl: string): string {
  return photoUrl.replace(/\.jpg$/, "-card.jpg");
}
