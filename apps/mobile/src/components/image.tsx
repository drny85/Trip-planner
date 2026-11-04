import { Image as ExpoImage } from "expo-image";
import { withUniwind } from "uniwind";

/** expo-image with `className` support (third-party components need withUniwind). */
export const Image = withUniwind(ExpoImage);
