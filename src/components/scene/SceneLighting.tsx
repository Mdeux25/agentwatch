export function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.12} color="#1a1a3e" />
      {/* Overhead key light — reveals tile depth */}
      <directionalLight position={[0, 30, 8]} intensity={0.5} color="#818cf8" />
      {/* Soft fill from the side */}
      <pointLight position={[15, 12, 0]} intensity={0.25} color="#3b82f6" />
      <pointLight position={[-15, 12, 0]} intensity={0.2} color="#6366f1" />
    </>
  )
}
