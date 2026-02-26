module.exports = function (options, webpack) {
  return {
    ...options,
    externals: {
      talib: 'commonjs talib',
    },
  };
};
