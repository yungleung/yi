/**
 * The context export asset resolution needs from the note.
 *
 * Example: `{ document: '/notes', images: null }` tries a relative picture beside the note first,
 * with no configured image folder as a second candidate.
 *
 * May import: nothing. Upholds: asset lookup depends on a small named contract rather than the
 * export pipeline that happens to carry the same folders.
 */

/** The two folders a relative destination is read from. */
export interface ImageBases {
  /** The folder of the document being exported, or null when it has no file yet. */
  document: string | null;
  /** The folder the settings name for images, or null when the reader named none. */
  images: string | null;
}

/** What drawing a note's pictures has to ask the app: the folders, and whether a file is there. */
export interface PictureLookup {
  bases: ImageBases;
  exists: (path: string) => Promise<boolean>;
}
