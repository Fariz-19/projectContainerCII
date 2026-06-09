 const supabaseUrl = "https://ppcpkgycxqvvzelxeaxc.supabase.co";
  const supabaseKey = "sb_publishable_vjAxDgEB0K4PWEuHQD6oQw_vY3eaY-I";

  const db = supabase.createClient(supabaseUrl, supabaseKey);

  async function getAllData() {
  const { data, error } = await db
    .from("mainTable")
    .select("*");

  console.log("DATA:", data);
  console.log("ERROR:", error);
}

async function loadData() {
  const { data, error } = await db
    .from("mainTable")
    .select("*");

  const tbody = document.getElementById("tableBody");

  tbody.innerHTML = "";

  data.forEach(row => {
    tbody.innerHTML += `
      <tr>
        <td>${row.id}</td>
        <td>${row.noPlat}</td>
        <td>${row.nama}</td>
        <td>${new Date(row.timeIn).toLocaleString()}</td>
        <td><input type="datetime-local" value="${row.timeOut ? new Date(row.timeOut).toISOString().slice(0, 16) : ''}" /></td>
      </tr>
    `;
  });
};

async function updateData() {
  const { data, error } = await db
    .from("mainTable")
    .select("*");

  const tbody = document.getElementById("tableBody");

  tbody.innerHTML = "";

  data.forEach(row => {
    tbody.innerHTML += `
      <tr>
        <td>${row.id}</td>
        <td>${row.noPlat}</td>
        <td>${row.nama}</td>
        <td>${new Date(row.timeIn).toLocaleString()}</td>
        <td><input type="datetime-local" value="${row.timeOut ? new Date(row.timeOut).toISOString().slice(0, 16) : ''}" /></td>
      </tr>
    `;
  });
};

loadData();