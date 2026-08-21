import type { PointerEvent } from "react"
import { getPrimarySymbolPosts } from "../../../lib/schematic/post-endpoints"
import { getSymbolPinWorldPositions } from "../../../lib/schematic/transforms"
import type { SymbolObject, Vec2 } from "../../../lib/schematic/types"

type PinLayerProps = {
  interactive: boolean
  pinMode?: "all" | "primary-posts"
  symbols: SymbolObject[]
  onPinPointerDown: (
    symbolId: string,
    componentPinId: string,
    position: Vec2,
    event: PointerEvent<SVGCircleElement>,
  ) => void
}

export function PinLayer({
  interactive,
  pinMode = "all",
  symbols,
  onPinPointerDown,
}: PinLayerProps) {
  return (
    <g className={interactive ? "pin-layer" : "pin-layer inactive"}>
      {symbols.flatMap((symbol) =>
        symbolPinsForMode(symbol, pinMode).map((pin) => (
          <circle
            key={`${symbol.id}-${pin.componentPinId}`}
            className="pin"
            cx={pin.position.x}
            cy={pin.position.y}
            r={5}
            onPointerDown={(event) =>
              onPinPointerDown(symbol.id, pin.componentPinId, pin.position, event)
            }
          />
        )),
      )}
    </g>
  )
}

function symbolPinsForMode(
  symbol: SymbolObject,
  pinMode: NonNullable<PinLayerProps["pinMode"]>,
) {
  return pinMode === "primary-posts"
    ? getPrimarySymbolPosts(symbol)
    : getSymbolPinWorldPositions(symbol)
}
