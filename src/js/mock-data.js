/* Mock data for local development when API is unavailable */

export const mockCategoriesData = {
  "mode": "home",
  "categories": [
    {
      "id": "1",
      "name": "佛号念诵",
      "icon": "🙏",
      "series": [
        {
          "id": "amitabha-48",
          "categoryId": "1",
          "title": "阿弥陀佛四十八愿",
          "teacher": "净空法师",
          "thumbnail": "/icons/icon-512x512.png",
          "episodes": [
            {
              "num": 1,
              "title": "第一愿：国无恶道愿",
              "duration": 3600
            }
          ]
        }
      ]
    },
    {
      "id": "2",
      "name": "净土经典",
      "icon": "📖",
      "series": [
        {
          "id": "wuliangshounian",
          "categoryId": "2",
          "title": "无量寿经",
          "teacher": "净空法师",
          "thumbnail": "/icons/icon-512x512.png",
          "episodes": [
            {
              "num": 1,
              "title": "第一集",
              "duration": 3600
            }
          ]
        }
      ]
    }
  ]
};
