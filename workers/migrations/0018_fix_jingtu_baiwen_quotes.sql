-- 修复净土百问中因英文双引号导致的音频路径错误
-- 前台接口会用 file_name 重新拼接 audio.foyue.org URL，
-- 因此这里需要把 title、file_name、url 一并改回与 R2 对象一致的中文弯引号版本。

UPDATE episodes
SET
  title = '如何理解“直心是道场”',
  file_name = '如何理解“直心是道场”.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E5%A6%82%E4%BD%95%E7%90%86%E8%A7%A3%E2%80%9C%E7%9B%B4%E5%BF%83%E6%98%AF%E9%81%93%E5%9C%BA%E2%80%9D.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 38;

UPDATE episodes
SET
  title = '“色不异空”和“色即是空”的区别',
  file_name = '“色不异空”和“色即是空”的区别.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E2%80%9C%E8%89%B2%E4%B8%8D%E5%BC%82%E7%A9%BA%E2%80%9D%E5%92%8C%E2%80%9C%E8%89%B2%E5%8D%B3%E6%98%AF%E7%A9%BA%E2%80%9D%E7%9A%84%E5%8C%BA%E5%88%AB.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 41;

UPDATE episodes
SET
  title = '如何理解“都摄六根，净念相继”',
  file_name = '如何理解“都摄六根，净念相继”.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E5%A6%82%E4%BD%95%E7%90%86%E8%A7%A3%E2%80%9C%E9%83%BD%E6%91%84%E5%85%AD%E6%A0%B9%EF%BC%8C%E5%87%80%E5%BF%B5%E7%9B%B8%E7%BB%A7%E2%80%9D.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 54;

UPDATE episodes
SET
  title = '“唯心净土，自性弥陀”如何理解',
  file_name = '“唯心净土，自性弥陀”如何理解.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E2%80%9C%E5%94%AF%E5%BF%83%E5%87%80%E5%9C%9F%EF%BC%8C%E8%87%AA%E6%80%A7%E5%BC%A5%E9%99%80%E2%80%9D%E5%A6%82%E4%BD%95%E7%90%86%E8%A7%A3.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 59;

UPDATE episodes
SET
  title = '如何理解“不可以少善根福德得生彼国”',
  file_name = '如何理解“不可以少善根福德得生彼国”.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E5%A6%82%E4%BD%95%E7%90%86%E8%A7%A3%E2%80%9C%E4%B8%8D%E5%8F%AF%E4%BB%A5%E5%B0%91%E5%96%84%E6%A0%B9%E7%A6%8F%E5%BE%B7%E5%BE%97%E7%94%9F%E5%BD%BC%E5%9B%BD%E2%80%9D.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 67;

UPDATE episodes
SET
  title = '“如染香人，身有香气……”如何理解',
  file_name = '“如染香人，身有香气……”如何理解.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E2%80%9C%E5%A6%82%E6%9F%93%E9%A6%99%E4%BA%BA%EF%BC%8C%E8%BA%AB%E6%9C%89%E9%A6%99%E6%B0%94%E2%80%A6%E2%80%A6%E2%80%9D%E5%A6%82%E4%BD%95%E7%90%86%E8%A7%A3.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 68;

UPDATE episodes
SET
  title = '《圆通章》中“从生至生”如何理解',
  file_name = '《圆通章》中“从生至生”如何理解.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E3%80%8A%E5%9C%86%E9%80%9A%E7%AB%A0%E3%80%8B%E4%B8%AD%E2%80%9C%E4%BB%8E%E7%94%9F%E8%87%B3%E7%94%9F%E2%80%9D%E5%A6%82%E4%BD%95%E7%90%86%E8%A7%A3.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 79;

UPDATE episodes
SET
  title = '“万法不离自性”与“一切法无自性”',
  file_name = '“万法不离自性”与“一切法无自性”.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E2%80%9C%E4%B8%87%E6%B3%95%E4%B8%8D%E7%A6%BB%E8%87%AA%E6%80%A7%E2%80%9D%E4%B8%8E%E2%80%9C%E4%B8%80%E5%88%87%E6%B3%95%E6%97%A0%E8%87%AA%E6%80%A7%E2%80%9D.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 80;

UPDATE episodes
SET
  title = '《观经四帖疏》中“门余八万四千”的含义',
  file_name = '《观经四帖疏》中“门余八万四千”的含义.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E3%80%8A%E8%A7%82%E7%BB%8F%E5%9B%9B%E5%B8%96%E7%96%8F%E3%80%8B%E4%B8%AD%E2%80%9C%E9%97%A8%E4%BD%99%E5%85%AB%E4%B8%87%E5%9B%9B%E5%8D%83%E2%80%9D%E7%9A%84%E5%90%AB%E4%B9%89.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 81;

UPDATE episodes
SET
  title = '阿弥陀佛的“阿”字念“o”可以吗',
  file_name = '阿弥陀佛的“阿”字念“o”可以吗.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E9%98%BF%E5%BC%A5%E9%99%80%E4%BD%9B%E7%9A%84%E2%80%9C%E9%98%BF%E2%80%9D%E5%AD%97%E5%BF%B5%E2%80%9Co%E2%80%9D%E5%8F%AF%E4%BB%A5%E5%90%97.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 87;

UPDATE episodes
SET
  title = '如何做到“都摄六根，净念相继”',
  file_name = '如何做到“都摄六根，净念相继”.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E5%A6%82%E4%BD%95%E5%81%9A%E5%88%B0%E2%80%9C%E9%83%BD%E6%91%84%E5%85%AD%E6%A0%B9%EF%BC%8C%E5%87%80%E5%BF%B5%E7%9B%B8%E7%BB%A7%E2%80%9D.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 108;

UPDATE episodes
SET
  title = '“能行即是佛，何须念！”这个知见对不对',
  file_name = '“能行即是佛，何须念！”这个知见对不对.mp3',
  url = 'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E5%87%80%E5%9C%9F%E7%99%BE%E9%97%AE/%E2%80%9C%E8%83%BD%E8%A1%8C%E5%8D%B3%E6%98%AF%E4%BD%9B%EF%BC%8C%E4%BD%95%E9%A1%BB%E5%BF%B5%EF%BC%81%E2%80%9D%E8%BF%99%E4%B8%AA%E7%9F%A5%E8%A7%81%E5%AF%B9%E4%B8%8D%E5%AF%B9.mp3'
WHERE series_id = 'jingtu-baiwen' AND episode_num = 128;