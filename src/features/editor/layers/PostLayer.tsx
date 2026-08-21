import { ovalMarker } from "../../../lib/schematic/post-markers"
import { getVisiblePosts } from "../../../lib/schematic/post-endpoints"
import type { SchematicObject } from "../../../lib/schematic/types"

type PostLayerProps = {
  objects: SchematicObject[]
}

export function PostLayer({ objects }: PostLayerProps) {
  const posts = getVisiblePosts(objects)

  return (
    <g className="post-layer" data-testid="post-layer">
      {posts.map((post) => (
        <PostDot key={post.key} post={post} />
      ))}
    </g>
  )
}

function PostDot({
  post,
}: {
  post: ReturnType<typeof getVisiblePosts>[number]
}) {
  const marker = ovalMarker(post.position)
  return (
    <ellipse
      className={post.kind === "annotation" ? "annotation-post" : "wire-post"}
      data-testid={post.kind === "annotation" ? "annotation-post" : "wire-post"}
      cx={marker.cx}
      cy={marker.cy}
      rx={marker.rx}
      ry={marker.ry}
    />
  )
}
