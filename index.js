function main() {
  // last-n slider
  const last_n_slider = document.querySelector(".last-n-slider");
  const last_n = document.querySelector(".last-n");
  if (last_n_slider.value == 0) {
    last_n.textContent = "All";
  } else {
    last_n.textContent = Number(last_n_slider.value) + Number(last_n_slider.step);
  }

  // connect to websocket
  const socket = new WebSocket("wss://tinymod.dev:10000");
  // const socket = new WebSocket("ws://localhost:10000");
  console.log("Connecting to websocket");

  // state
  const charts = {};
  let currCommit = "";
  let lastUpdateTime = Date.now();

  function reload_charts() {
    for (const card of document.querySelectorAll(".stat-card")) {
      if (card.hasAttribute("data-charted")) {
        observer.unobserve(card);
        observer.observe(card);
        card.removeAttribute("data-charted");
      }
    }
    lastUpdateTime = Date.now();
  }

  // last-n slider event listener
  last_n_slider.addEventListener("input", (event) => {
    if (event.target.value == last_n_slider.max) {
      last_n.textContent = "All";
    } else {
      last_n.textContent = Number(last_n_slider.value) +
        Number(last_n_slider.step);
    }

    reload_charts();
  });

  socket.onmessage = (event) => {
    // split event.data on first space
    // first part is status code
    // second part is data
    const data = JSON.parse(event.data);
    if ("error" in data) {
      console.error("ws api error: ", data.error);
      return;
    }

    if ("benchmarks" in data) {
      console.log(data);
      // generate integer only chart ticks for the x axis
      const x_ticks = [];
      let lowest_x = Infinity;
      let highest_x = -Infinity;
      for (const benchmark of data.benchmarks) {
        if (benchmark.length == 0) continue;
        if (benchmark[0].x < lowest_x) {
          lowest_x = benchmark[0].x;
        }
        if (benchmark[benchmark.length - 1].x > highest_x) {
          highest_x = benchmark[benchmark.length - 1].x;
        }
      }
      const low = Math.floor(lowest_x / 10) * 10;
      const high = Math.ceil(highest_x / 10) * 10;
      const divisor = (high - low) / 10;
      for (let i = low; i < high; i += divisor) {
        const i_10 = i;
        if (i_10 < lowest_x || i_10 > highest_x) continue;
        x_ticks.push(i_10);
      }

      // update chart
      charts[`${data.filename}-${data.system}`].update({
        series: data.benchmarks,
      }, {
        showPoint: (data.benchmarks[0].length <= 100) ? true : false,
        showLine: true,
        showArea: true,
        lineSmooth: false,
        axisX: {
          type: Chartist.FixedScaleAxis,
          ticks: x_ticks,
          high: highest_x,
          low: lowest_x,
        },
      });
    } else if ("commit" in data) {
      const lastUpdated = document.querySelector("#last-updated");
      lastUpdated.textContent = new Date(Date.now() - lastUpdateTime)
        .toISOString().slice(11, 19);
      if (currCommit === data.commit) return;
      const commitElem = document.querySelector("#curr-commit");
      commitElem.textContent = data.commit.slice(0, 7);
      commitElem.href =
        `https://github.com/tinygrad/tinygrad/commit/${data.commit}`;
      currCommit = data.commit;

      reload_charts();
    }
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const filename = entry.target.getAttribute("data-filename");
      const system = entry.target.getAttribute("data-system");

      if (entry.isIntersecting) {
        // check if there is a chart already
        if (!entry.target.hasAttribute("data-charted")) {
          charts[`${filename}-${system}`] = new Chartist.Line(
            `#chart-${filename.replace(/\.[^/.]+$/, "")}-${system}`,
          );

          let last_n_v = Number(last_n_slider.value) +
            Number(last_n_slider.step);
          if (last_n_v > Number(last_n_slider.max)) {
            last_n_v = 0;
          }

          socket.send(
            `get-benchmark ${filename} ${system} ${last_n_v}`,
          );

          entry.target.setAttribute("data-charted", true);
        }
      }
    });
  }, {
    threshold: 0.25,
  });

  socket.onopen = () => {
    console.log("Connected to websocket");
    socket.send("get-commit");
    setInterval(() => {
      socket.send("get-commit");
    }, 2000);
    for (const card of document.querySelectorAll(".stat-card")) {
      observer.observe(card);
    }
  };
}

main();
