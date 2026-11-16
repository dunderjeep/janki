// `smiles-drawer` ships no type declarations and has no @types package.
// MolViewer2D loads it dynamically and drives it through an `any` handle, so an
// ambient module declaration is all that's needed to satisfy the build.
declare module 'smiles-drawer';
