import esbuild from 'esbuild';

const isDev = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/client/main.js'],
  bundle: true,
  outfile: 'dist/client/bundle.js',
  platform: 'browser',
  target: ['es2020'],
  format: 'iife',
  sourcemap: true,
  minify: !isDev,
  external: [],
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
  },
};

async function build() {
  try {
    if (isDev) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      await esbuild.build(config);
      console.log('Client bundle built successfully!');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
