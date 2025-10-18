const way = window.way;

way.comp("countdown", () => {
  const count = way.signal(10);
  let int;

  const restart = () => {
    if (int) clearInterval(int);

    count.value = 10;

    int = setInterval(() => {
      count.value--;
      if (count.value == 0) {
        clearInterval(int);
      }
    }, 500);
  };

  restart();
  return {
    count,
    restart,
  };
});
