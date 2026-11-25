/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The location a new device signs in to, until it is set with ?location=<slug>. */
  readonly VITE_LOCATION_SLUG?: string;
}
