import Svg, { Defs, G, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';

// The Electrify logo: a yellow bolt in the middle of a black square.
// Same shape as assets/icon.png.
export default function Logo({ size = 36, radius = 24 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="electrifyBolt" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE45C" />
          <Stop offset="1" stopColor="#FFC200" />
        </LinearGradient>
      </Defs>
      <Rect width="100" height="100" rx={radius} fill="#000000" />
      <G transform="translate(50 50) scale(0.6667) translate(-50 -50)">
        <Polygon
          points="60,2 22,56 44,56 36,98 78,40 55,40"
          fill="url(#electrifyBolt)"
          stroke="url(#electrifyBolt)"
          strokeWidth="3.3"
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}
