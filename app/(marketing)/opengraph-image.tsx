import { ImageResponse } from "next/og";

export const alt = "Attestly: security questionnaires, answered with citations.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand colours from docs/spec.md section 6, as hex: next/og cannot read CSS variables.
const ink = "#17202A";
const parchment = "#FAF8F4";
const evergreen = "#0F5C5A";
const mossLight = "#DDEBE7";
const slate = "#5A6571"; // spec slate, darkened a touch for small text on parchment
const rule = "rgba(23, 32, 42, 0.07)";
const LINE = 30;

/** Ledger ruling drawn as hairline divs: Satori has no repeating backgrounds. */
function Ledger() {
  const rows = Array.from({ length: Math.floor(size.height / LINE) }, (_, i) => (i + 1) * LINE);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex" }}>
      {rows.map((y) => (
        <div key={y} style={{ position: "absolute", left: 0, top: y, width: size.width, height: 1, background: rule }} />
      ))}
      {/* Margin rule, as on ledger paper */}
      <div style={{ position: "absolute", top: 0, left: 56, width: 1, height: size.height, background: "rgba(15, 92, 90, 0.35)" }} />
      <div style={{ position: "absolute", top: 0, left: 60, width: 1, height: size.height, background: "rgba(15, 92, 90, 0.35)" }} />
    </div>
  );
}

function CheckSquare({ px }: { px: number }) {
  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: px * 0.18,
        background: evergreen,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: px * 0.28,
          height: px * 0.52,
          marginTop: -px * 0.1,
          borderRight: `${Math.round(px * 0.12)}px solid ${parchment}`,
          borderBottom: `${Math.round(px * 0.12)}px solid ${parchment}`,
          transform: "rotate(45deg)",
        }}
      />
    </div>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          background: parchment,
          color: ink,
          fontFamily: "sans-serif",
        }}
      >
        <Ledger />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "72px 80px 64px 112px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <CheckSquare px={44} />
            <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: -1 }}>Attestly</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 76, lineHeight: 1.06, letterSpacing: -2 }}>
              <div>Security questionnaires,</div>
              <div>answered with citations.</div>
            </div>

            <div style={{ display: "flex", marginTop: 40, gap: 0 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: mossLight,
                  borderLeft: `5px solid ${evergreen}`,
                  padding: "14px 22px",
                  maxWidth: 900,
                }}
              >
                <div style={{ display: "flex", fontSize: 18, color: slate }}>
                  Attestly › 1 Principle
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", fontSize: 24, marginTop: 6 }}>
                  Every answer cites its source or says it has none.
                  <div
                    style={{
                      display: "flex",
                      marginLeft: 8,
                      marginTop: -4,
                      padding: "2px 7px",
                      borderRadius: 5,
                      fontSize: 15,
                      fontWeight: 600,
                      background: evergreen,
                      color: parchment,
                    }}
                  >
                    1
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
